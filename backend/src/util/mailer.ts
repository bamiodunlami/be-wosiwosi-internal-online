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

// Header fields (to/subject) are built from customer-controlled order data
// (customerName/orderNumber). Strip CR/LF so a crafted value can't inject extra
// SMTP headers or recipients (defense-in-depth — nodemailer also guards this).
const stripHeader = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();

/** Send one email. Throws on failure — callers decide whether to swallow or retry. */
export async function sendMail(opts: MailOptions): Promise<void> {
  const info = await transport.sendMail({
    from: env.MAILER_USERNAME,
    to: stripHeader(opts.to),
    bcc: opts.bcc && opts.bcc.length ? opts.bcc.map(stripHeader) : undefined,
    subject: stripHeader(opts.subject),
    text: opts.text,
    html: opts.html,
  });
  logger.info({ messageId: info.messageId }, 'Email sent');
}
