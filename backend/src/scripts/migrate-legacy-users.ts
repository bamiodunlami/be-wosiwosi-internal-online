/**
 * One-off migration: copy users from the LEGACY database (`test`) into the v2
 * `users` collection. Both databases live on the same Atlas cluster; this script is
 * the ONLY place that reads the legacy data — the running app never touches it.
 *
 * Run dry-run first (default — prints the plan, writes nothing):
 *   cd backend && npx tsx src/scripts/migrate-legacy-users.ts
 * Then commit for real:
 *   cd backend && npx tsx src/scripts/migrate-legacy-users.ts --commit
 *
 * What it does:
 *  - Reads `test.users` (read-only).
 *  - Maps each legacy user to the slim v2 shape (see mapUser below).
 *  - PRESERVES passwords by copying `hash`+`salt` verbatim — this only works because
 *    v2 uses the same passport-local-mongoose defaults (PBKDF2 25000/512/sha256), so
 *    the copied hash verifies as-is. (Do NOT change the plugin's PBKDF2 params or
 *    these migrated logins break — see models/user.model.ts.)
 *  - Idempotent: a legacy email already present in v2 is SKIPPED (never overwritten),
 *    so it can't clobber the bootstrap super-admin or double-insert on a re-run.
 *  - Never writes to the legacy database; never deletes anything.
 *
 * Role mapping (legacy role/duty → v2 role), agreed 2026-06-04:
 *   staff + packer   → packer
 *   staff + manager  → supervisor
 *   admin (any duty) → admin        (levels 4/5/6 all → admin)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { env } from '../util/env.js';
import { logger } from '../util/logger.js';
import { Roles, ALL_ROLES, type Role } from '../util/roles.js';

const COMMIT = process.argv.includes('--commit');

// v2 passChange: false = force a password change on next login; true = no forced
// change. We preserve passwords, so default to a seamless login (no forced change).
// Flip to true to force every migrated user to set a new password on first login.
const FORCE_PASSWORD_CHANGE = false;

const LEGACY_DB = 'test';

/** A legacy user document (only the fields we read). */
interface LegacyUser {
  _id: unknown;
  username?: string;
  fname?: string;
  lname?: string;
  role?: string;
  duty?: string;
  level?: number;
  status?: boolean;
  hash?: string;
  salt?: string;
}

/** The slim v2 user document we insert. */
interface V2User {
  email: string;
  fname: string;
  lname: string;
  role: Role;
  active: boolean;
  passChange: boolean;
  hash: string;
  salt: string;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
}

/** Map legacy role/duty → v2 role. Keyed on `role` (disambiguates the level-4 split). */
function mapRole(u: LegacyUser): Role {
  if (u.role === 'admin') return Roles.ADMIN;
  if (u.duty === 'manager') return Roles.SUPERVISOR; // staff + manager
  return Roles.PACKER; // staff + packer (and any unrecognised → least privilege)
}

/** Validate + convert one legacy doc to the v2 shape. Returns a reason string if it must be skipped. */
function mapUser(u: LegacyUser, now: Date): { doc?: V2User; skip?: string } {
  const email = (u.username ?? '').trim().toLowerCase();
  if (!email) return { skip: 'no username/email' };
  if (!u.hash || !u.salt) return { skip: 'missing hash/salt (cannot preserve password)' };
  const role = mapRole(u);
  if (!ALL_ROLES.includes(role)) return { skip: `unmapped role (${u.role}/${u.duty})` };
  return {
    doc: {
      email,
      fname: u.fname ?? '',
      lname: u.lname ?? '',
      role,
      active: u.status !== false, // legacy `status` → v2 `active`
      passChange: !FORCE_PASSWORD_CHANGE,
      hash: u.hash,
      salt: u.salt,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    },
  };
}

async function main() {
  const conn = await mongoose.connect(mongoUri(), { dbName: env.MONGO_DB }); // connect at cluster level
  const legacy = conn.connection.useDb(LEGACY_DB, { useCache: true }).collection('users');
  const v2 = conn.connection.useDb(env.MONGO_DB, { useCache: true }).collection('users');

  const legacyUsers = (await legacy.find({}).toArray()) as unknown as LegacyUser[];
  const existingEmails = new Set(
    (await v2.find({}, { projection: { email: 1 } }).toArray()).map((d) =>
      String(d.email).toLowerCase(),
    ),
  );

  const now = new Date();
  const toInsert: V2User[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const roleCounts: Record<string, number> = {};

  for (const u of legacyUsers) {
    const { doc, skip } = mapUser(u, now);
    if (skip || !doc) {
      skipped.push({ email: u.username ?? '(none)', reason: skip ?? 'unknown' });
      continue;
    }
    if (existingEmails.has(doc.email)) {
      skipped.push({ email: doc.email, reason: 'already exists in v2 (left untouched)' });
      continue;
    }
    toInsert.push(doc);
    roleCounts[doc.role] = (roleCounts[doc.role] ?? 0) + 1;
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  logger.info(
    { mode: COMMIT ? 'COMMIT' : 'DRY-RUN', legacyDb: LEGACY_DB, targetDb: env.MONGO_DB },
    'Legacy user migration',
  );
  logger.info(
    { legacyTotal: legacyUsers.length, willInsert: toInsert.length, willSkip: skipped.length },
    'Summary',
  );
  for (const d of toInsert) {
    logger.info({ email: d.email, role: d.role, active: d.active, passChange: d.passChange }, 'WILL INSERT');
  }
  for (const s of skipped) {
    logger.info({ email: s.email, reason: s.reason }, 'SKIP');
  }
  logger.info({ roleCounts }, 'Role breakdown (to insert)');

  if (!COMMIT) {
    logger.info('DRY-RUN — no changes written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  if (toInsert.length) {
    const res = await v2.insertMany(toInsert, { ordered: false });
    logger.info({ inserted: res.insertedCount }, 'COMMIT complete — users inserted');
  } else {
    logger.info('Nothing to insert.');
  }

  const finalTotal = await v2.countDocuments();
  logger.info({ v2UsersTotal: finalTotal }, 'v2 users collection size after migration');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migrate-legacy-users failed');
  process.exit(1);
});
