import type { Checklist, ChecklistItem } from '@todo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHECKLISTS_KEY,
  OFFLINE,
  type AddChecklistItemVars,
  type UpdateChecklistItemVars,
} from '../lib/queryClient';
import { api } from './client';

export { CHECKLISTS_KEY };

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

/** Adds an item (works offline: shown at once, sent when back online). */
export const useAddChecklistItem = () =>
  useMutation<ChecklistItem, Error, AddChecklistItemVars>({
    mutationKey: OFFLINE.addChecklistItem,
  });

/** Checks/unchecks or edits an item (works offline: shown at once, sent when back online). */
export const useUpdateChecklistItem = () =>
  useMutation<ChecklistItem, Error, UpdateChecklistItemVars>({
    mutationKey: OFFLINE.updateChecklistItem,
  });

export function useDeleteChecklistItem() {
  const updateCache = useUpdateCache();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      api<void>(`/checklists/${id}/items/${itemId}`, json('DELETE')),
    onSuccess: (_r, { id, itemId }) =>
      updateCache(id, (c) => ({ ...c, items: c.items.filter((i) => i.id !== itemId) })),
  });
}
