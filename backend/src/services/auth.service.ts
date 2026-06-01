import passport from 'passport';
import mongoose from 'mongoose';
import { User, type UserDoc } from '../models/user.model.js';

/**
 * passport-local-mongoose returns a loosely-typed strategy that doesn't
 * satisfy passport's TS overloads. Cast through any — runtime behaviour is
 * correct, this is purely a TS escape. The strategy authenticates against the
 * `email`/password pair (usernameField is `email`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
passport.use(User.createStrategy() as any);

// Sessions store only the ObjectId; every request re-loads the user by `_id`.
// We don't use p-l-m's default (de)serialisers because those key on the
// username field — here the ObjectId is the query point.
passport.serializeUser<string>((user, done) => {
  done(null, (user as UserDoc).id);
});

passport.deserializeUser<string>(async (id, done) => {
  // A session minted before this app keyed on `_id` may hold a non-ObjectId
  // (e.g. an email). Treat anything that isn't a valid ObjectId as "logged
  // out" rather than letting findById throw a CastError and 500 the request.
  if (!mongoose.isValidObjectId(id)) return done(null, false);
  try {
    const user = await User.findById(id);
    done(null, user ?? false);
  } catch (err) {
    done(err as Error);
  }
});

export { passport };
