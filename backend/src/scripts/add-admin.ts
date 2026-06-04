/**
 * Manually add (or update) an admin user in the v2 `users` collection.
 *
 * This is the bootstrap way to get an account before the Super Admin UI
 * (Slice 4) exists. The PASSWORD is never hardcoded — set it in the env and run:
 *
 *   cd backend && ADMIN_PASSWORD='your-strong-password' npx tsx src/scripts/add-admin.ts
 *
 * (or put ADMIN_PASSWORD in backend/.env, which is gitignored). Edit the name/
 * email/role constants below as needed. Re-running with the same email updates
 * that user (resets password, role, name, active flag).
 *
 * Password hashing: passport-local-mongoose stores `hash`/`salt`, never a
 * plaintext password — so we build the doc, then `setPassword()` (which
 * computes hash+salt), then `save()`. Don't put `password` on the schema.
 */

import 'dotenv/config';
import { connectDb, disconnectDb } from '../util/db.js';
import { logger } from '../util/logger.js';
import { User } from '../models/user.model.js';
import { Roles } from '../util/roles.js';

// ─── Edit me (non-secret) ─────────────────────────────────────────────────────
const ADMIN = {
  email: 'bamidele@wosiwosi.co.uk', // login identifier
  fname: 'Super',
  lname: 'Admin',
  role: Roles.SUPER_ADMIN,
  active: true,
  // false = force a password change on first login; true = no forced change
  passChange: false,
};
// ─────────────────────────────────────────────────────────────────────────────

// The password comes from the environment, never source control.
function requireAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) {
    logger.error('Set ADMIN_PASSWORD (min 8 chars) in the env before running this script.');
    process.exit(1);
  }
  return pw;
}

async function main() {
  await connectDb();

  // Matched on email (the unique field); the ObjectId is generated on insert.
  let user = await User.findOne({ email: ADMIN.email });

  if (!user) {
    user = new User({
      email: ADMIN.email,
      fname: ADMIN.fname,
      lname: ADMIN.lname,
      role: ADMIN.role,
      active: ADMIN.active,
      passChange: ADMIN.passChange,
    });
  } else {
    user.fname = ADMIN.fname;
    user.lname = ADMIN.lname;
    user.role = ADMIN.role;
    user.active = ADMIN.active;
    user.passChange = ADMIN.passChange;
  }

  await user.setPassword(requireAdminPassword()); // computes hash + salt
  await user.save();

  logger.info({ id: user.id, email: user.email, role: user.role }, 'Admin user saved');

  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'add-admin failed');
  process.exit(1);
});
