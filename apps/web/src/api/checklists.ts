import type {
  Checklist,
  ChecklistItem,
  CreateChecklistItemInput,
  UpdateChecklistItemInput,
} from '@todo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const CHECKLISTS_KEY = ['checklists'] as const;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function useChecklists() {
  return useQuery({
    queryKey: CHECKLISTS_KEY,
    queryFn: () => api<{ items: Checklist[] }>('/checklists').then((r) => r.items),
  });
}

/** Applies a change to one checklist in the cached list. */
function useUpdateCache() {
  const queryClient = useQueryClient();
  return (id: string, update: (c: Checklist) => Checklist | null) =>
    queryClient.setQueryData<Checklist[]>(CHECKLISTS_KEY, (list) =>
      list?.flatMap((c) => {
        if (c.id !== id) return [c];
        const next = update(c);
        return next ? [next] : [];
      }),
    );
}

export function useCreateChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api<Checklist>('/checklists', json('POST', { title })),
    onSuccess: (created) =>
      queryClient.setQueryData<Checklist[]>(CHECKLISTS_KEY, (list) => [created, ...(list ?? [])]),
  });
}

export function useRenameChecklist() {
  const updateCache = useUpdateCache();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<Checklist>(`/checklists/${id}`, json('PATCH', { title })),
    onSuccess: (renamed) => updateCache(renamed.id, () => renamed),
  });
}

export function useDeleteChecklist() {
  const updateCache = useUpdateCache();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/checklists/${id}`, json('DELETE')),
    onSuccess: (_r, id) => updateCache(id, () => null),
  });
}

export function useAddChecklistItem() {
  const updateCache = useUpdateCache();
  return useMutation({
    mutationFn: ({ id, text }: { id: string } & CreateChecklistItemInput) =>
      api<ChecklistItem>(`/checklists/${id}/items`, json('POST', { text })),
    onSuccess: (item, { id }) => updateCache(id, (c) => ({ ...c, items: [...c.items, item] })),
  });
}

/**
 * Checks/unchecks or edits an item. The change shows at once and is rolled back if saving fails.
 */
export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();
  const updateCache = useUpdateCache();
  const patchItem = (id: string, itemId: string, change: Partial<ChecklistItem>) =>
    updateCache(id, (c) => ({
      ...c,
      items: c.items.map((i) => (i.id === itemId ? { ...i, ...change } : i)),
    }));

  return useMutation({
    mutationFn: ({
      id,
      itemId,
      ...input
    }: { id: string; itemId: string } & UpdateChecklistItemInput) =>
      api<ChecklistItem>(`/checklists/${id}/items/${itemId}`, json('PATCH', input)),
    onMutate: async ({ id, itemId, ...input }) => {
      await queryClient.cancelQueries({ queryKey: CHECKLISTS_KEY });
      const before = queryClient.getQueryData<Checklist[]>(CHECKLISTS_KEY);
      patchItem(id, itemId, input);
      return { before };
    },
    onError: (_err, _vars, context) => {
      if (context?.before) queryClient.setQueryData(CHECKLISTS_KEY, context.before);
    },
    onSuccess: (item, { id }) => patchItem(id, item.id, item),
  });
}

export function useDeleteChecklistItem() {
  const updateCache = useUpdateCache();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      api<void>(`/checklists/${id}/items/${itemId}`, json('DELETE')),
    onSuccess: (_r, { id, itemId }) =>
      updateCache(id, (c) => ({ ...c, items: c.items.filter((i) => i.id !== itemId) })),
  });
}
