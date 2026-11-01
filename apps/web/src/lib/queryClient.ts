import type { Checklist, ChecklistItem, Task } from '@todo/shared';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
  type Query,
} from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { ME_KEY } from '../api/auth';
import { api, ApiRequestError, OfflineError } from '../api/client';

/*
 * Offline support.
 *
 * 1. A copy of what was last loaded (the user, tasks, lists, checklists) is kept on the device
 *    (IndexedDB) and shown when there's no connection. It's removed when the user signs out.
 * 2. A few small changes work offline: checking/unchecking and adding checklist items, and
 *    marking tasks done or not done. They show at once, wait in a queue (kept on the device, so
 *    they survive closing the app) and are sent in order when the connection is back.
 *    Everything else needs a connection and says so straight away (see `api()`).
 */

const DAY = 24 * 60 * 60 * 1000;
/** How long the saved copy is kept without being refreshed. */
const MAX_AGE = 7 * DAY;
/** Only these queries are saved on the device (never e.g. push subscription objects). */
const SAVED_QUERY_ROOTS = new Set(['me', 'tasks', 'lists', 'checklists']);

export const TASKS_KEY = ['tasks'] as const;
export const LISTS_KEY = ['lists'] as const;
export const CHECKLISTS_KEY = ['checklists'] as const;

/** The kinds of change that can be made offline. */
export const OFFLINE = {
  taskDone: ['offline', 'task-done'],
  addChecklistItem: ['offline', 'checklist-item-add'],
  updateChecklistItem: ['offline', 'checklist-item-update'],
} as const;
/**
 * How offline-capable changes run: they wait while offline, go one at a time in the order they
 * were made, and keep retrying on network errors (never dropped); a real error (e.g. the item
 * was deleted elsewhere) stops it.
 */
const OFFLINE_OPTIONS = {
  networkMode: 'online',
  scope: { id: 'offline-sync' },
  retry: (_count: number, err: unknown) => isNetworkError(err),
} as const;

// TanStack Query assumes it's online until an "offline" event; an app opened without a
// connection gets no such event, so start from the browser's actual state.
onlineManager.setOnline(navigator.onLine);

/** No connection (or the request never reached the server): worth trying again later. */
const isNetworkError = (err: unknown) => err instanceof OfflineError || err instanceof TypeError;

export const queryClient: QueryClient = new QueryClient({
  // A 401 from any request means the session ended (expired, reset elsewhere): show login.
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ApiRequestError && err.status === 401) void signedOut();
    },
  }),
  // A queued offline change that the server refused is dropped; leave a trace for debugging.
  mutationCache: new MutationCache({
    onError: (err, _vars, _context, mutation) => {
      if (mutation.options.mutationKey?.[0] === 'offline') {
        console.warn('Offline change could not be saved', mutation.options.mutationKey, err);
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
      // Keep data in memory at least as long as the saved copy (or restoring discards it).
      gcTime: MAX_AGE,
    },
    mutations: {
      // Run even when offline, so ordinary changes fail at once with "You're offline"
      // instead of waiting silently. The offline-capable ones below opt back into waiting.
      networkMode: 'always',
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'app-cache',
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: MAX_AGE,
  // Change when the shape of saved data changes, to discard old copies.
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' &&
      SAVED_QUERY_ROOTS.has(String(query.queryKey[0])) &&
      // "Signed out" is never saved: on start the app always asks the server.
      query.state.data !== null,
    // Every unfinished offline change, including one being sent at that moment (the app may
    // close before it completes). Sending one again is safe: they're all repeatable.
    shouldDehydrateMutation: (mutation) =>
      mutation.state.status === 'pending' && mutation.options.mutationKey?.[0] === 'offline',
  },
};

/**
 * After the saved copy is restored: send the changes that were waiting. Unlike
 * `resumePausedMutations`, this includes one that was being sent when the app closed.
 */
export function resumeSavedChanges() {
  return Promise.all(
    queryClient
      .getMutationCache()
      .getAll()
      .filter((m) => m.state.status === 'pending')
      .map((m) => m.continue().catch(() => {})),
  );
}

/** Forgets everything about the signed-in user, on this device too. */
export async function signedOut() {
  await queryClient.cancelQueries();
  queryClient.clear();
  await persister.removeClient();
  queryClient.setQueryData(ME_KEY, null);
}

// ---- Offline-capable changes ----

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** Returns `value` with every task object `id` changed by `change` (any nesting). */
function patchTasks(value: unknown, id: string, change: Partial<Task>): unknown {
  if (Array.isArray(value)) return value.map((v) => patchTasks(v, id, change));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.id === id && 'status' in obj && 'title' in obj) return { ...obj, ...change };
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, patchTasks(v, id, change)]));
  }
  return value;
}

function patchChecklist(id: string, update: (c: Checklist) => Checklist) {
  queryClient.setQueryData<Checklist[]>(CHECKLISTS_KEY, (list) =>
    list?.map((c) => (c.id === id ? update(c) : c)),
  );
}

const refreshTasks = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
    queryClient.invalidateQueries({ queryKey: LISTS_KEY }),
  ]);
const refreshChecklists = () => queryClient.invalidateQueries({ queryKey: CHECKLISTS_KEY });

export type TaskDoneVars = { id: string; done: boolean };
export type AddChecklistItemVars = { checklistId: string; itemId: string; text: string };
export type UpdateChecklistItemVars = {
  checklistId: string;
  itemId: string;
  text?: string;
  done?: boolean;
};

// Registered up front (not in components) so changes queued before the app was closed can
// still be sent after it's opened again.
queryClient.setMutationDefaults(OFFLINE.taskDone, {
  ...OFFLINE_OPTIONS,
  mutationFn: ({ id, done }: TaskDoneVars) =>
    api(`/tasks/${id}/${done ? 'complete' : 'reopen'}`, json('POST')),
  onMutate: async ({ id, done }: TaskDoneVars) => {
    await queryClient.cancelQueries({ queryKey: TASKS_KEY });
    queryClient.setQueriesData({ queryKey: TASKS_KEY }, (data) =>
      patchTasks(data, id, {
        status: done ? 'COMPLETED' : 'OPEN',
        completedAt: done ? new Date().toISOString() : null,
      }),
    );
  },
  // Repeating tasks get their next occurrence from the server, so always reload afterwards.
  onSettled: refreshTasks,
});

queryClient.setMutationDefaults(OFFLINE.addChecklistItem, {
  ...OFFLINE_OPTIONS,
  // The id is chosen here, so sending the same item again (a retry) can't add it twice.
  mutationFn: ({ checklistId, itemId, text }: AddChecklistItemVars) =>
    api<ChecklistItem>(`/checklists/${checklistId}/items`, json('POST', { id: itemId, text })),
  onMutate: async ({ checklistId, itemId, text }: AddChecklistItemVars) => {
    await queryClient.cancelQueries({ queryKey: CHECKLISTS_KEY });
    patchChecklist(checklistId, (c) => ({
      ...c,
      items: [...c.items, { id: itemId, text, done: false }],
    }));
  },
  onError: refreshChecklists,
});

queryClient.setMutationDefaults(OFFLINE.updateChecklistItem, {
  ...OFFLINE_OPTIONS,
  mutationFn: ({ checklistId, itemId, ...change }: UpdateChecklistItemVars) =>
    api<ChecklistItem>(`/checklists/${checklistId}/items/${itemId}`, json('PATCH', change)),
  onMutate: async ({ checklistId, itemId, ...change }: UpdateChecklistItemVars) => {
    await queryClient.cancelQueries({ queryKey: CHECKLISTS_KEY });
    patchChecklist(checklistId, (c) => ({
      ...c,
      items: c.items.map((i) => (i.id === itemId ? { ...i, ...change } : i)),
    }));
  },
  // E.g. the item was deleted on another device meanwhile: show what the server has.
  onError: refreshChecklists,
});
