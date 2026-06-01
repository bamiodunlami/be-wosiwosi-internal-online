import type { Request, Response, NextFunction } from 'express';
import { passport } from '../services/auth.service.js';
import { toDTO, findById } from '../services/user.service.js';
import { logger } from '../util/logger.js';
import type { UserDoc } from '../models/user.model.js';

export function login(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate(
    'local',
    (err: Error | null, user: UserDoc | false, info: { message?: string } | undefined) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message ?? 'Invalid credentials' });
      if (!user.active) return res.status(403).json({ error: 'Account disabled' });

      // Regenerate the session on login to defeat session fixation — an
      // anonymous (attacker-known) session id must not carry into the
      // authenticated session.
      req.session.regenerate((regenErr) => {
        if (regenErr) return next(regenErr);
        req.login(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          logger.info({ email: user.email, role: user.role }, 'User logged in');
          res.json(toDTO(user));
        });
      });
    },
  )(req, res, next);
}

export function logout(req: Request, res: Response, next: NextFunction): void {
  const email = (req.user as UserDoc | undefined)?.email;
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      logger.info({ email }, 'User logged out');
      res.status(204).end();
    });
  });
}

export function me(req: Request, res: Response): void {
  res.json(toDTO(req.user as UserDoc));
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user as UserDoc;
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  try {
    const fresh = await findById(user.id);
    if (!fresh) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await fresh.changePassword(currentPassword, newPassword);
    fresh.passChange = true;
    await fresh.save();

    logger.info({ email: fresh.email }, 'Password changed');
    res.status(204).end();
  } catch (err) {
    // passport-local-mongoose throws IncorrectPasswordError on bad current pass
    const message =
      (err as Error).name === 'IncorrectPasswordError'
        ? 'Current password is incorrect'
        : 'Failed to change password';
    logger.warn({ err, email: user.email }, 'change-password failed');
    next(Object.assign(new Error(message), { status: 400 }));
  }
}
