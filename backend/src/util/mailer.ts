import nodemailer from 'nodemailer';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * One shared SMTP transport (built from the MAILER_* env vars), but **options are
 * passed per call** — there is no global `mailOptions` (a legacy anti-pattern that
 * leaked the previous recipient between sends). Callers `await sendMail`.
 *
 * Creating the transport is lazy/side-effect-free (no connection until a send), so
 * importing this module on boot is safe.
 */
const transport = nodemailer.createTransport({
  host: env.MAILER_HOST,
  port: env.MAILER_PORT,
  secure: env.MAILER_PORT === 465, // 465 = implicit TLS
  auth: { user: env.MAILER_USERNAME, pass: env.MAILER_PASS },
});

export interface MailOptions {
  to: string;
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
}

/** Send one email. Throws on failure — callers decide whether to swallow or retry. */
export async function sendMail(opts: MailOptions): Promise<void> {
  const info = await transport.sendMail({
    from: env.MAILER_USERNAME,
    to: opts.to,
    bcc: opts.bcc && opts.bcc.length ? opts.bcc : undefined,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  logger.info({ to: opts.to, messageId: info.messageId }, 'Email sent');
}
