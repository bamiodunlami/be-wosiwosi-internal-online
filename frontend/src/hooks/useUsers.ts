import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../api/users';
import type { CreateUserInput, UpdateUserInput } from '../api/users';
import { ApiError } from '../api/client';
import type { User } from '@shared';

// Shared with usePackers() in useOrders.ts — both read the same listing, so a
// mutation here also refreshes the assign-packer dropdown.
const usersKey = ['users', 'list'] as const;

export function useUsers() {
  return useQuery<User[], ApiError>({ queryKey: usersKey, queryFn: usersApi.listUsers });
}

function useUsersMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation<TResult, ApiError, TArgs>({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export const useCreateUser = () =>
  useUsersMutation<CreateUserInput, User>((input) => usersApi.createUser(input));

export const useUpdateUser = () =>
  useUsersMutation<{ id: string; input: UpdateUserInput }, User>(({ id, input }) =>
    usersApi.updateUser(id, input),
  );

export const useSetUserActive = () =>
  useUsersMutation<{ id: string; active: boolean }, void>(({ id, active }) =>
    usersApi.setUserActive(id, active),
  );

export const useResetUserPassword = () =>
  useUsersMutation<{ id: string; newPassword: string }, void>(({ id, newPassword }) =>
    usersApi.resetUserPassword(id, newPassword),
  );

export const useDeleteUser = () => useUsersMutation<string, void>((id) => usersApi.deleteUser(id));
