import type { ReactNode } from 'react';

/**
 * The app's inline SVG icon set — replaces the emoji glyphs, which render
 * inconsistently across platforms and can't be tinted. Paths follow the
 * familiar 24×24 outline style (lucide-like); stroke is `currentColor`, so
 * colour comes from the parent's text colour (red = destructive per the UI
 * rules). No icon library dependency — the bundle stays dep-free.
 */

function Icon({
  className = 'h-4 w-4',
  strokeWidth = 2,
  children,
}: {
  className?: string;
  strokeWidth?: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

/** ✕ — close/dismiss/remove. */
export function XIcon({ className }: IconProps) {
  return (
    <Icon className={className} strokeWidth={2.5}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

/** Refund a line (the ❌ action) — same mark as XIcon, semantic alias. */
export const RefundIcon = XIcon;

/** 🔄 — log/cancel a replacement on a line. */
export function ReplaceIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </Icon>
  );
}

/** ✓ — picked/active state. */
export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className} strokeWidth={2.5}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

/** ✅ — completed banner / Completed operation. */
export function CheckCircleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </Icon>
  );
}

/** 🔔 — notifications. */
export function BellIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </Icon>
  );
}

/** 📦 — orders / dry products. */
export function BoxIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <path d="m3.3 7 8.7 5 8.7-5" />
    </Icon>
  );
}

/** ⏳ — processing. */
export function HourglassIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </Icon>
  );
}

/** 💷 — refunds (money). */
export function BanknoteIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </Icon>
  );
}

/** 📊 — reports. */
export function ChartIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </Icon>
  );
}

/** 👥 — user management. */
export function UsersIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

/** ⚙️ — system settings. */
export function SettingsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** 🔁 — redo (repeat). */
export function RepeatIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </Icon>
  );
}

/** 🔒 — locked. */
export function LockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  );
}

/** 🔓 — unlocked. */
export function UnlockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </Icon>
  );
}

/** 👤 — assigned person. */
export function UserIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  );
}

/** ⚠️ — warning. */
export function AlertIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

/** 🚫 — blocked. */
export function BanIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </Icon>
  );
}

/** ♻️ — reset worker (rewind arrow). */
export function ResetIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

/** 🗑 — clear/delete. */
export function TrashIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

/** 📝 — customer note. */
export function NoteIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2Z" />
      <path d="M15 21v-5a2 2 0 0 1 2-2h5" />
    </Icon>
  );
}

/** ❄️ — frozen products. */
export function SnowflakeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M2 12h20" />
      <path d="M12 2v20" />
      <path d="m20 16-4-4 4-4" />
      <path d="m4 8 4 4-4 4" />
      <path d="m16 4-4 4-4-4" />
      <path d="m8 20 4-4 4 4" />
    </Icon>
  );
}
