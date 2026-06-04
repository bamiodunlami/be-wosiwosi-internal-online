import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ordersApi from '../api/orders';
import { listUsers } from '../api/users';
import { ApiError } from '../api/client';
import type { StoreQuery } from '../api/orders';
import { Roles } from '@shared';
import type { Order, OrderDetail, OrderNote, OrderView, StoreOrder, User, SaveResult } from '@shared';

const ordersKey = ['orders'] as const;
const listKey = (view: OrderView, q?: string) => ['orders', 'list', view, q ?? ''] as const;
const detailKey = (id: string) => ['orders', 'detail', id] as const;
const storeKey = (query: StoreQuery) => ['orders', 'store', query] as const;

export function useOrders(view: OrderView, q?: string) {
  return useQuery<Order[], ApiError>({
    queryKey: listKey(view, q),
    queryFn: () => ordersApi.listOrders(view, q),
  });
}

export function useOrder(id: string) {
  return useQuery<Order, ApiError>({
    queryKey: detailKey(id),
    queryFn: () => ordersApi.getOrder(id),
  });
}

const liveDetailKey = (orderId: number) => ['orders', 'detail-live', orderId] as const;

export function useOrderDetail(orderId: number) {
  return useQuery<OrderDetail, ApiError>({
    queryKey: liveDetailKey(orderId),
    queryFn: () => ordersApi.getOrderDetail(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
  });
}

/**
 * Live WooCommerce status check for the detail page. Runs independently of the
 * (DB-served) detail load so it never blocks rendering — the page shows instantly
 * and this resolves a moment later to confirm the order is still workable.
 */
export function useOrderLiveStatus(orderId: number, enabled = true) {
  return useQuery<{ status: string | null }, ApiError>({
    queryKey: ['orders', 'live-status', orderId],
    queryFn: () => ordersApi.getOrderLiveStatus(orderId),
    enabled: enabled && Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Fold the warehouse state from a returned Order onto the cached OrderDetail.
 *
 * Deliberately does NOT touch `products` (the picked flags): only the pick action
 * changes those, and it manages them optimistically. Letting Dry/Meat/Complete/
 * Assign responses overwrite products here would clobber a just-ticked product
 * whose own POST hadn't committed yet on the server.
 */
function applyOrderToDetail(prev: OrderDetail, o: Order): OrderDetail {
  return {
    ...prev,
    saved: true,
    status: o.status,
    completedAt: o.completedAt, // so Complete shows the date and Undo clears it
    dryPicked: o.dryPicked,
    meatPicked: o.meatPicked,
    assigned: o.assigned,
    lock: o.lock,
  };
}

/**
 * Factory for the shared detail page's write actions (pick / dry / meat / complete).
 * Optionally applies an optimistic patch for instant feedback, reconciles with the
 * server response, and invalidates only the order *lists* — never the live detail
 * query, so we don't re-hit WooCommerce and there's no lag.
 */
function useDetailWrite<V>(
  orderId: number,
  fn: (vars: V) => Promise<Order>,
  optimistic?: (prev: OrderDetail, vars: V) => OrderDetail,
) {
  const qc = useQueryClient();
  const key = liveDetailKey(orderId);

  return useMutation<Order, ApiError, V, { prev?: OrderDetail }>({
    mutationFn: fn,
    onMutate: async (vars) => {
      if (!optimistic) return {};
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<OrderDetail>(key);
      if (prev) qc.setQueryData<OrderDetail>(key, optimistic(prev, vars));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (updated) => {
      const cur = qc.getQueryData<OrderDetail>(key);
      if (cur) qc.setQueryData<OrderDetail>(key, applyOrderToDetail(cur, updated));
      qc.invalidateQueries({ queryKey: ['orders', 'list'] });
    },
  });
}

export const usePickInDetail = (orderId: number) =>
  useDetailWrite<{ id: string; index: number; picked: boolean }>(
    orderId,
    ({ id, index, picked }) => ordersApi.setPicked(id, index, picked),
    (prev, { index, picked }) => ({
      ...prev,
      products: prev.products.map((p, i) => (i === index ? { ...p, picked } : p)),
    }),
  );

export const useDryPickedInDetail = (orderId: number) =>
  useDetailWrite<string>(orderId, (id) => ordersApi.setDryPicked(id), (prev) => ({
    ...prev,
    dryPicked: !prev.dryPicked,
  }));

export const useMeatPickedInDetail = (orderId: number) =>
  useDetailWrite<string>(orderId, (id) => ordersApi.setMeatPicked(id), (prev) => ({
    ...prev,
    meatPicked: !prev.meatPicked,
  }));

export const useCompleteInDetail = (orderId: number) =>
  useDetailWrite<string>(orderId, (id) => ordersApi.completeOrder(id));

export const useAssignInDetail = (orderId: number) =>
  useDetailWrite<{ id: string; packerId: string }>(orderId, ({ id, packerId }) =>
    ordersApi.assignOrder(id, { packerId }),
  );

export const useUndoInDetail = (orderId: number) =>
  useDetailWrite<string>(orderId, (id) => ordersApi.undoComplete(id));

export const useToggleLockInDetail = (orderId: number) =>
  useDetailWrite<string>(orderId, (id) => ordersApi.toggleLock(id), (prev) => ({
    ...prev,
    lock: !prev.lock,
  }));

export const useResetWorkerInDetail = (orderId: number) =>
  useDetailWrite<string>(orderId, (id) => ordersApi.resetWorker(id), (prev) => ({
    ...prev,
    assigned: null,
  }));

/** Clear the note thread; replaces the cached detail's notes with the server's. */
export function useClearNotesInDetail(orderId: number) {
  const qc = useQueryClient();
  const key = liveDetailKey(orderId);
  return useMutation<OrderNote[], ApiError, string>({
    mutationFn: (id) => ordersApi.clearNotes(id),
    onSuccess: (notes) => {
      const cur = qc.getQueryData<OrderDetail>(key);
      if (cur) qc.setQueryData<OrderDetail>(key, { ...cur, notes });
    },
  });
}

/** Add a note; replaces the cached detail's note thread with the server's. */
export function useAddNote(orderId: number) {
  const qc = useQueryClient();
  const key = liveDetailKey(orderId);
  return useMutation<OrderNote[], ApiError, { id: string; message: string }>({
    mutationFn: ({ id, message }) => ordersApi.addNote(id, message),
    onSuccess: (notes) => {
      const cur = qc.getQueryData<OrderDetail>(key);
      if (cur) qc.setQueryData<OrderDetail>(key, { ...cur, notes });
    },
  });
}

/** WooCommerce-backed global search (all roles). */
export function useStoreSearch(q: string) {
  return useQuery<StoreOrder[], ApiError>({
    queryKey: ['orders', 'store-search', q],
    queryFn: () => ordersApi.searchStoreOrders(q),
    enabled: q.trim().length > 0,
  });
}

export function useStoreOrders(query: StoreQuery) {
  return useQuery<StoreOrder[], ApiError>({
    queryKey: storeKey(query),
    queryFn: () => ordersApi.listStoreOrders(query),
  });
}

/** Packers only — for the assign dropdown. */
export function usePackers() {
  return useQuery<User[], ApiError>({
    queryKey: ['users', 'list'],
    queryFn: listUsers,
    select: (users) => users.filter((u) => u.role === Roles.PACKER && u.active),
    staleTime: 60_000,
  });
}

/**
 * Wraps a mutation that returns the updated Order: refreshes the detail cache
 * and invalidates every order list so counts/positions stay correct.
 */
function useOrderMutation<TArgs>(fn: (args: TArgs) => Promise<Order>) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, TArgs>({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(detailKey(order.id), order);
      qc.invalidateQueries({ queryKey: ordersKey });
    },
  });
}

export const useDryPicked = () => useOrderMutation<string>((id) => ordersApi.setDryPicked(id));
export const useMeatPicked = () => useOrderMutation<string>((id) => ordersApi.setMeatPicked(id));
export const useCompleteOrder = () => useOrderMutation<string>((id) => ordersApi.completeOrder(id));
export const useAssignOrder = () =>
  useOrderMutation<{ id: string; packerId: string }>(({ id, packerId }) =>
    ordersApi.assignOrder(id, { packerId }),
  );
export const useToggleLock = () => useOrderMutation<string>((id) => ordersApi.toggleLock(id));
export const useResetWorker = () => useOrderMutation<string>((id) => ordersApi.resetWorker(id));
export const useToggleHide = () =>
  useOrderMutation<{ id: string; index: number }>(({ id, index }) =>
    ordersApi.toggleHide(id, index),
  );
export const useUndoComplete = () => useOrderMutation<string>((id) => ordersApi.undoComplete(id));

export function useRemoveOrder() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: ordersApi.removeOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ordersKey }),
  });
}

export function useSaveOrders() {
  const qc = useQueryClient();
  return useMutation<SaveResult, ApiError, number[]>({
    mutationFn: (orderIds) => ordersApi.saveOrders({ orderIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordersKey }),
  });
}

/** Remove a saved order from processing (by WooCommerce order id). */
export function useRemoveSavedOrder() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: (orderId) => ordersApi.removeStoreOrder(orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordersKey }),
  });
}

/** Cancel an order on the store (Admin+). Irreversible; drops it from processing. */
export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, number>({
    mutationFn: (orderId) => ordersApi.cancelStoreOrder(orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordersKey }),
  });
}

/** Cancel AND fully refund an order. The refund is verified before the cancel. */
export function useCancelRefundOrder() {
  const qc = useQueryClient();
  return useMutation<{ status: string; refunded: string }, ApiError, number>({
    mutationFn: (orderId) => ordersApi.cancelRefundStoreOrder(orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ordersKey }),
  });
}
