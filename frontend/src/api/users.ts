import { api } from './client';
import type { Role, User } from '@shared';

const BASE = '/api/v1/users';

/** Body for creating a staff account (Super Admin only). */
export interface CreateUserInput {
  email: string;
  fname: string;
  lname: string;
  role: Role;
  password: string; // initial password — user must change on first login
}

/** Body for editing a staff account — at least one field. MUST match updateUserSchema. */
export interface UpdateUserInput {
  email?: string;
  fname?: string;
  lname?: string;
  role?: Role;
}

/** List every staff user (also feeds the "assign packer" dropdown). */
export function listUsers(): Promise<User[]> {
  return api<User[]>(BASE);
}

export function createUser(input: CreateUserInput): Promise<User> {
  return api<User>(BASE, { method: 'POST', body: input });
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return api<User>(`${BASE}/${id}`, { method: 'PATCH', body: input });
}

export function setUserActive(id: string, active: boolean): Promise<void> {
  return api<void>(`${BASE}/${id}/${active ? 'enable' : 'disable'}`, { method: 'POST' });
}

export function resetUserPassword(id: string, newPassword: string): Promise<void> {
  return api<void>(`${BASE}/${id}/reset-password`, { method: 'POST', body: { newPassword } });
}

export function deleteUser(id: string): Promise<void> {
  return api<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
