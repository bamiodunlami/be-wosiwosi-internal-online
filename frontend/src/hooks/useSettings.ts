import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as settingsApi from '../api/settings';
import { ApiError } from '../api/client';
import type { Settings, SettingsUpdate } from '@shared';

const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery<Settings, ApiError>({ queryKey: settingsKey, queryFn: settingsApi.getSettings });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, ApiError, SettingsUpdate>({
    mutationFn: settingsApi.updateSettings,
    onSuccess: (settings) => qc.setQueryData(settingsKey, settings),
  });
}
