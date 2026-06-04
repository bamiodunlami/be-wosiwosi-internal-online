import { api } from './client';
import type { Settings, SettingsUpdate } from '@shared';

const BASE = '/api/v1/settings';

export function getSettings(): Promise<Settings> {
  return api<Settings>(BASE);
}

export function updateSettings(body: SettingsUpdate): Promise<Settings> {
  return api<Settings>(BASE, { method: 'PATCH', body });
}
