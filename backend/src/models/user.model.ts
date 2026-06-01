import mongoose, { Document, Model } from 'mongoose';
import passportLocalMongoose from 'passport-local-mongoose';
import { ALL_ROLES, type Role } from '../util/roles.js';

/**
 * v2 user document, stored in the `users` collection of the v2 database
 * (a separate database from legacy — see CLAUDE.md). Bootstrap an initial
 * admin via backend/src/scripts/add-admin.ts; further accounts are
 * created via the Super Admin UI (Slice 4).
 */
export interface UserDoc extends Document {
  email: string;
  fname: string;
  lname: string;
  role: Role;
  active: boolean;
  passChange: boolean;

  // passport-local-mongoose adds these at runtime
  setPassword(password: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  authenticate(password: string): Promise<{ user?: UserDoc; error?: Error }>;
}

interface UserModel extends Model<UserDoc> {
  // passport-local-mongoose static methods (commonly used). `usernameField`
  // is `email`, so these operate on the email field even though p-l-m keeps
  // the historic `*ByUsername` naming.
  register(user: Partial<UserDoc>, password: string): Promise<UserDoc>;
  createStrategy(): unknown;
  findByUsername(email: string): Promise<UserDoc | null>;
}

const userSchema = new mongoose.Schema<UserDoc>(
  {
    // The login identifier is the user's email. Lookups elsewhere key on
    // `_id` (the ObjectId); email is unique mainly to prevent duplicates.
    email: { type: String, required: true, unique: true, index: true },
    fname: { type: String, required: true },
    lname: { type: String, default: '' },
    role: { type: String, enum: ALL_ROLES, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    passChange: { type: Boolean, default: false },
  },
  {
    collection: 'users', // in the v2 database — fully isolated from legacy
    strict: true,
    timestamps: true,
  },
);

userSchema.plugin(passportLocalMongoose, {
  usernameField: 'email',
});

export const User = mongoose.model<UserDoc, UserModel>('User', userSchema);
