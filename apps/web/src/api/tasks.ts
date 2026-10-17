import type {
  CompleteTaskResponse,
  CreateTaskInput,
  List,
  ListInput,
  ListTasksQuery,
  Task,
  TodayResponse,
  UpdateTaskInput,
} from '@todo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// ---- Tasks ----

export const TASKS_KEY = ['tasks'] as const;
export const LISTS_KEY = ['lists'] as const;

export function useToday() {
  return useQuery({
    queryKey: [...TASKS_KEY, 'today'],
    queryFn: () => api<TodayResponse>('/tasks/today'),
  });
}

export function useOverdue() {
  return useQuery({
    queryKey: [...TASKS_KEY, 'overdue'],
    queryFn: () => api<{ items: Task[] }>('/tasks/overdue').then((r) => r.items),
  });
}

export function useTasks(query: ListTasksQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v));
  return useQuery({
    queryKey: [...TASKS_KEY, 'list', query],
    queryFn: () => api<{ items: Task[] }>(`/tasks?${params}`).then((r) => r.items),
  });
}

/** Wraps a mutation so every task view and list count refreshes afterwards. */
function useTaskMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
        queryClient.invalidateQueries({ queryKey: LISTS_KEY }),
      ]),
  });
}

export const useCreateTask = () =>
  useTaskMutation((input: CreateTaskInput) => api<Task>('/tasks', json('POST', input)));

export const useUpdateTask = () =>
  useTaskMutation(({ id, input }: { id: string; input: UpdateTaskInput }) =>
    api<Task>(`/tasks/${id}`, json('PATCH', input)),
  );

export const useDeleteTask = () =>
  useTaskMutation((id: string) => api<void>(`/tasks/${id}`, json('DELETE')));

export const useSetTaskDone = () =>
  useTaskMutation(({ id, done }: { id: string; done: boolean }): Promise<unknown> =>
    done
      ? api<CompleteTaskResponse>(`/tasks/${id}/complete`, json('POST'))
      : api<Task>(`/tasks/${id}/reopen`, json('POST')),
  );

// ---- Lists ----

export function useLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: () => api<{ items: List[] }>('/lists').then((r) => r.items),
  });
}

export const useCreateList = () =>
  useTaskMutation((input: ListInput) => api<List>('/lists', json('POST', input)));

export const useRenameList = () =>
  useTaskMutation(({ id, name }: { id: string; name: string }) =>
    api<List>(`/lists/${id}`, json('PATCH', { name })),
  );

export const useDeleteList = () =>
  useTaskMutation((id: string) => api<void>(`/lists/${id}`, json('DELETE')));
