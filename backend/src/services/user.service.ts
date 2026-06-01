import { User, type UserDoc } from '../models/user.model.js';
import type { User as UserDTO } from '../util/types/user.js';
import { Roles, hasAtLeast, type Role } from '../util/roles.js';

/** Throw an Error carrying an HTTP status so the error handler returns it cleanly. */
function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/**
 * Shape returned to clients. Never leaks password hashes or legacy fields.
 */
export function toDTO(doc: UserDoc): UserDTO {
  return {
    id: doc.id, // ObjectId as a hex string — the client's handle for this user
    email: doc.email,
    fname: doc.fname,
    lname: doc.lname ?? '',
    role: doc.role,
    active: doc.active,
    passChange: doc.passChange,
  };
}

export async function findById(id: string): Promise<UserDoc | null> {
  return User.findById(id);
}

export async function listAll(): Promise<UserDTO[]> {
  // Only users with a v2 role field set — filters out legacy-only users
  // (influencers, anyone not migrated yet)
  const docs = await User.find({ role: { $exists: true } }).sort({ fname: 1 });
  return docs.map(toDTO);
}

export async function create(input: {
  email: string;
  fname: string;
  lname: string;
  role: Role;
  password: string;
}): Promise<UserDTO> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw httpError(409, `A user with email ${input.email} already exists`);
  }

  // passport-local-mongoose handles password hashing
  const doc = await User.register(
    {
      email: input.email,
      fname: input.fname,
      lname: input.lname,
      role: input.role,
      active: true,
      passChange: false, // false = must change on first login
    } as Partial<UserDoc>,
    input.password,
  );
  return toDTO(doc);
}

export async function update(
  id: string,
  input: { email?: string; fname?: string; lname?: string; role?: Role },
): Promise<UserDTO> {
  const user = await User.findById(id);
  if (!user) throw httpError(404, 'User not found');

  if (input.email && input.email !== user.email) {
    const clash = await User.findOne({ email: input.email });
    if (clash) throw httpError(409, `A user with email ${input.email} already exists`);
    user.email = input.email;
  }
  if (input.fname !== undefined) user.fname = input.fname;
  if (input.lname !== undefined) user.lname = input.lname;
  if (input.role !== undefined) user.role = input.role;

  await user.save();
  return toDTO(user);
}

/**
 * Delete a user. A Super Admin may delete anyone but themselves; an Admin may
 * delete only users below admin rank (packers/supervisors) — never an admin or
 * super-admin. Role changes and account creation remain Super Admin–only.
 */
export async function remove(id: string, actor: { id: string; role: Role }): Promise<void> {
  const user = await User.findById(id);
  if (!user) throw httpError(404, 'User not found');
  if (String(user._id) === actor.id) throw httpError(400, 'You cannot delete your own account');

  const allowed =
    actor.role === Roles.SUPER_ADMIN ||
    (actor.role === Roles.ADMIN && !hasAtLeast(user.role, Roles.ADMIN));
  if (!allowed) throw httpError(403, 'You are not allowed to delete this user');

  await User.deleteOne({ _id: id });
}

export async function setActive(id: string, active: boolean): Promise<void> {
  await User.updateOne({ _id: id }, { $set: { active } });
}

export async function resetPasswordTo(id: string, newPassword: string): Promise<void> {
  const user = await User.findById(id);
  if (!user) throw httpError(404, 'User not found');
  await user.setPassword(newPassword);
  user.passChange = false; // force change on next login
  await user.save();
}
