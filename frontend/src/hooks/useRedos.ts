import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as redosApi from '../api/redos';
import { listUsers } from '../api/users';
import { ApiError } from '../api/client';
import { Roles } from '@shared';
import type {
  RedoListItem,
  RedoDetail,
  RedoNote,
  CreateRedoRequest,
  User,
} from '@shared';

const redosKey = ['redos'] as const;
const redoDetailKey = (id: string) => ['redos', 'detail', id] as const;

export function useRedos() {
  return useQuery<RedoListItem[], ApiError>({ queryKey: redosKey, queryFn: redosApi.listRedos });
}

export function useRedo(id: string) {
  return useQuery<RedoDetail, ApiError>({
    queryKey: redoDetailKey(id),
    queryFn: () => redosApi.getRedo(id),
    enabled: !!id,
  });
}

export function useCreateRedo() {
  const qc = useQueryClient();
  return useMutation<RedoDetail, ApiError, CreateRedoRequest>({
    mutationFn: redosApi.createRedo,
    onSuccess: () => qc.invalidateQueries({ queryKey: redosKey }),
  });
}

/**
 * Factory for a redo write action that returns the updated RedoDetail: writes it
 * straight into the detail cache and invalidates the queue list.
 */
function useRedoWrite<V>(id: string, fn: (vars: V) => Promise<RedoDetail>) {
  const qc = useQueryClient();
  return useMutation<RedoDetail, ApiError, V>({
    mutationFn: fn,
    onSuccess: (updated) => {
      qc.setQueryData(redoDetailKey(id), updated);
      qc.invalidateQueries({ queryKey: redosKey });
    },
  });
}

export const useRedoPick = (id: string) =>
  useRedoWrite<{ index: number; picked: boolean }>(id, ({ index, picked }) =>
    redosApi.setRedoPicked(id, index, picked),
  );
export const useRedoDryPicked = (id: string) => useRedoWrite<void>(id, () => redosApi.setRedoDryPicked(id));
export const useRedoMeatPicked = (id: string) => useRedoWrite<void>(id, () => redosApi.setRedoMeatPicked(id));
export const useCompleteRedo = (id: string) => useRedoWrite<void>(id, () => redosApi.completeRedo(id));
export const useAssignRedo = (id: string) =>
  useRedoWrite<{ packerId: string }>(id, ({ packerId }) => redosApi.assignRedo(id, { packerId }));
export const useToggleRedoLock = (id: string) => useRedoWrite<void>(id, () => redosApi.toggleRedoLock(id));
export const useResetRedoWorker = (id: string) => useRedoWrite<void>(id, () => redosApi.resetRedoWorker(id));

// Refund + replacement on a redo — all return the updated RedoDetail.
export const useRequestRedoRefund = (id: string) =>
  useRedoWrite<{ productId: number; quantity: number; amount: string }>(id, (body) =>
    redosApi.requestRedoRefund(id, body),
  );
export const useResolveRedoRefund = (id: string) =>
  useRedoWrite<{ productId: number; decision: 'approved' | 'rejected' | 'pending' }>(
    id,
    ({ productId, decision }) => redosApi.resolveRedoRefund(id, productId, decision),
  );
export const useLogRedoReplacement = (id: string) =>
  useRedoWrite<{ productId: number; quantity: number; replacementProduct: string; note?: string }>(
    id,
    (body) => redosApi.logRedoReplacement(id, body),
  );
export const useClearRedoReplacement = (id: string) =>
  useRedoWrite<number>(id, (productId) => redosApi.clearRedoReplacement(id, productId));

/** Delete a redo entirely (Admin+) — invalidates the queue list. */
export function useRemoveRedo() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => redosApi.removeRedo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: redosKey }),
  });
}

/** Add a redo note; replaces the cached detail's redo-note thread with the server's. */
export function useAddRedoNote(id: string) {
  const qc = useQueryClient();
  return useMutation<RedoNote[], ApiError, string>({
    mutationFn: (message) => redosApi.addRedoNote(id, message),
    onSuccess: (notes) => {
      const cur = qc.getQueryData<RedoDetail>(redoDetailKey(id));
      if (cur) qc.setQueryData<RedoDetail>(redoDetailKey(id), { ...cur, redoNotes: notes });
    },
  });
}

/** Clear the redo's staff-note thread (Admin+); writes the empty thread into cache. */
export function useClearRedoNotes(id: string) {
  const qc = useQueryClient();
  return useMutation<RedoNote[], ApiError, void>({
    mutationFn: () => redosApi.clearRedoNotes(id),
    onSuccess: (notes) => {
      const cur = qc.getQueryData<RedoDetail>(redoDetailKey(id));
      if (cur) qc.setQueryData<RedoDetail>(redoDetailKey(id), { ...cur, redoNotes: notes });
    },
  });
}

/** Packers only — for the assign dropdown. */
export function useRedoPackers() {
  return useQuery<User[], ApiError>({
    queryKey: ['users', 'list'],
    queryFn: listUsers,
    select: (users) => users.filter((u) => u.role === Roles.PACKER && u.active),
    staleTime: 60_000,
  });
}
