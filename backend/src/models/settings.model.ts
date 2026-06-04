import mongoose, { Schema, type Document } from 'mongoose';

/**
 * App-wide settings — a single document (the collection holds at most one row).
 * Read/written through the settings service, never instantiated per request.
 *
 * - `refundBcc`: the accountant/manager group BCC'd on refund emails (SPEC §8 —
 *   a setting, not the legacy's hardcoded list).
 * - `lock`: the system lock (SPEC §7). Stored here for when the lock toggle ships;
 *   the systemLock middleware is still a stub until then.
 */

export interface SettingsDoc extends Document {
  refundBcc: string[];
  lock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<SettingsDoc>(
  {
    refundBcc: { type: [String], default: [] },
    lock: { type: Boolean, default: false },
  },
  { collection: 'settings', timestamps: true },
);

export const Settings = mongoose.model<SettingsDoc>('Settings', settingsSchema);
