import { api } from './client';
import type { User, LoginRequest, ChangePasswordRequest } from '@shared';

export function login(body: LoginRequest): Promise<User> {
  return api<User>('/api/v1/auth/login', { method: 'POST', body });
}

export function logout(): Promise<void> {
  return api<void>('/api/v1/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<User> {
  return api<User>('/api/v1/auth/me');
}

export function changePassword(body: ChangePasswordRequest): Promise<void> {
  return api<void>('/api/v1/auth/change-password', { method: 'POST', body });
}
