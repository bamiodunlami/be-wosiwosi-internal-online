import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import type { LoginRequest, ChangePasswordRequest, User } from '@shared';

const ME_KEY = ['auth', 'me'] as const;

export function useCurrentUser() {
  return useQuery<User | null, ApiError>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await authApi.getMe();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 10_000,
    // Poll so the system-lock flag (SPEC §7) propagates: a locked packer is bounced
    // to the lock page, and released back when an admin unlocks, within ~15s.
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, LoginRequest>({
    mutationFn: authApi.login,
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation<void, ApiError>({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.clear();
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, ChangePasswordRequest>({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      // The server cleared the "must change password" flag. Patch the cached
      // /me synchronously so RoleGuard stops bouncing the user back here, then
      // refetch to stay authoritative.
      qc.setQueryData<User | null>(ME_KEY, (cur) => (cur ? { ...cur, passChange: true } : cur));
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
