import type { Complaint, ComplaintStatus } from '@/types';

export interface ComplaintDelayInfo {
  is_delayed: boolean;
  days_delayed: number;
  delay_anchor: string;
  reason?: string;
}

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function normalizeStatus(status?: ComplaintStatus | string): 'Pending' | 'In Progress' | 'Resolved' | null {
  if (!status || typeof status !== 'string') return null;
  const s = status.trim().toLowerCase();
  if (s === 'pending' || s === 'open') return 'Pending';
  if (s === 'in progress' || s === 'in_progress') return 'In Progress';
  if (s === 'resolved') return 'Resolved';
  return null;
}

/**
 * Calculates five-day complaint delay eligibility according to canonical rules:
 * - Pending complaints become warning-eligible after > 5 days in Pending.
 * - In Progress complaints become eligible after > 5 days since last meaningful status change
 *   or substantive progress update (tracked via last_meaningful_update_at).
 * - Resolved complaints are completely excluded.
 */
export function calculateComplaintDelay(
  complaint: Pick<
    Complaint,
    'status' | 'created_at' | 'last_meaningful_update_at' | 'updated_at' | '$createdAt'
  >,
  referenceTime: Date | number = new Date()
): ComplaintDelayInfo {
  const status = normalizeStatus(complaint.status);
  const refMs = typeof referenceTime === 'number' ? referenceTime : referenceTime.getTime();

  if (!status || status === 'Resolved') {
    return {
      is_delayed: false,
      days_delayed: 0,
      delay_anchor: '',
    };
  }

  let anchorStr = '';
  let reason = '';

  if (status === 'Pending') {
    anchorStr = complaint.created_at || complaint.$createdAt || '';
    reason = 'Complaint pending resolution for more than 5 days without initial response.';
  } else if (status === 'In Progress') {
    anchorStr =
      complaint.last_meaningful_update_at ||
      complaint.created_at ||
      complaint.$createdAt ||
      '';
    reason = 'Complaint in progress for more than 5 days without a substantive progress update.';
  }

  if (!anchorStr) {
    return {
      is_delayed: false,
      days_delayed: 0,
      delay_anchor: '',
    };
  }

  const anchorTime = new Date(anchorStr).getTime();
  if (isNaN(anchorTime)) {
    return {
      is_delayed: false,
      days_delayed: 0,
      delay_anchor: anchorStr,
    };
  }

  const elapsedMs = refMs - anchorTime;
  const daysDelayed = Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  const isDelayed = elapsedMs > FIVE_DAYS_MS;

  return {
    is_delayed: isDelayed,
    days_delayed: daysDelayed,
    delay_anchor: anchorStr,
    reason: isDelayed ? reason : undefined,
  };
}
