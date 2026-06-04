import { Settings, type SettingsDoc } from '../models/settings.model.js';
import type { Settings as SettingsDTO, SettingsUpdate } from '../util/types/settings.js';

/**
 * The settings singleton. `getDoc` lazily creates the row on first access (a
 * request/cron path, never on boot), so reads always return a usable document.
 */

function toDTO(doc: SettingsDoc): SettingsDTO {
  return { refundBcc: doc.refundBcc, lock: doc.lock };
}

export async function getDoc(): Promise<SettingsDoc> {
  const existing = await Settings.findOne();
  return existing ?? (await Settings.create({}));
}

export async function get(): Promise<SettingsDTO> {
  return toDTO(await getDoc());
}

export async function update(patch: SettingsUpdate): Promise<SettingsDTO> {
  const doc = await getDoc();
  if (patch.refundBcc !== undefined) doc.refundBcc = patch.refundBcc;
  if (patch.lock !== undefined) doc.lock = patch.lock;
  await doc.save();
  lockCache = doc.lock; // keep the system-lock cache fresh
  return toDTO(doc);
}

/** The refund-email BCC list (accountant/manager group) — used by the archival cron. */
export async function refundBcc(): Promise<string[]> {
  return (await getDoc()).refundBcc;
}

// Cache the system-lock flag so the lock guard doesn't hit the DB on every request.
// Single-doc, single-dyno → a module cache refreshed on update() is safe.
let lockCache: boolean | null = null;

/** Whether the system is locked (SPEC §7) — read by the lock guard and /me. */
export async function isSystemLocked(): Promise<boolean> {
  if (lockCache === null) lockCache = (await getDoc()).lock;
  return lockCache;
}
