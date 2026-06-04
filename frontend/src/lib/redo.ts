import type { RedoReason } from '@shared';

/** Human labels for the redo reasons (SPEC §9). */
export const REASON_LABELS: Record<RedoReason, string> = {
  damaged: 'Damaged',
  lost: 'Lost in transit',
  'wrong-item': 'Wrong item',
  'customer-complaint': 'Customer complaint',
  other: 'Other',
};
