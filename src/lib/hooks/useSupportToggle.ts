'use client';

import { useCallback, useRef, useState } from 'react';
import { apiRemoveSupport, apiSupportComplaint } from '../api';

export interface SupportStateSnapshot {
  support_count: number;
  has_supported: boolean;
}

export interface UseSupportToggleOptions {
  applyState: (complaintId: string, snapshot: SupportStateSnapshot) => void;
  onError?: (message: string) => void;
}

export interface ToggleSupportParams {
  complaintId: string;
  currentSupported: boolean;
  currentCount: number;
  isOwnComplaint?: boolean;
}

export interface UseSupportToggleResult {
  pendingMap: Readonly<Record<string, boolean>>;
  toggleSupport: (params: ToggleSupportParams) => Promise<void>;
}

/**
 * Shared optimistic support toggle state machine with per-complaint synchronous locks
 * and server-count reconciliation (handling ALREADY_SUPPORTED and rollback cleanly).
 */
export function useSupportToggle({
  applyState,
  onError,
}: UseSupportToggleOptions): UseSupportToggleResult {
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});

  const toggleSupport = useCallback(
    async ({
      complaintId,
      currentSupported,
      currentCount,
      isOwnComplaint,
    }: ToggleSupportParams): Promise<void> => {
      if (isOwnComplaint || pendingIdsRef.current.has(complaintId)) {
        return;
      }

      pendingIdsRef.current.add(complaintId);
      setPendingMap((prev) => ({ ...prev, [complaintId]: true }));

      const nextSupported = !currentSupported;
      const optimisticCount = nextSupported
        ? currentCount + 1
        : Math.max(1, currentCount - 1);

      applyState(complaintId, {
        support_count: optimisticCount,
        has_supported: nextSupported,
      });

      try {
        const res = nextSupported
          ? await apiSupportComplaint(complaintId)
          : await apiRemoveSupport(complaintId);

        if (res.success && res.data) {
          applyState(complaintId, {
            support_count: res.data.support_count,
            has_supported: res.data.has_supported,
          });
        } else if (!nextSupported || res.code !== 'ALREADY_SUPPORTED') {
          applyState(complaintId, {
            support_count: currentCount,
            has_supported: currentSupported,
          });
          if (res.error) {
            onError?.(res.error);
          }
        } else {
          // ALREADY_SUPPORTED: synchronize to active state & server count if returned
          const syncedCount =
            typeof (res.data as { support_count?: unknown } | undefined)?.support_count === 'number'
              ? (res.data as { support_count: number }).support_count
              : currentCount;
          applyState(complaintId, {
            support_count: Math.max(1, syncedCount),
            has_supported: true,
          });
        }
      } catch {
        applyState(complaintId, {
          support_count: currentCount,
          has_supported: currentSupported,
        });
        onError?.('Failed to update support status. Please try again.');
      } finally {
        pendingIdsRef.current.delete(complaintId);
        setPendingMap((prev) => {
          const next = { ...prev };
          delete next[complaintId];
          return next;
        });
      }
    },
    [applyState, onError]
  );

  return { pendingMap, toggleSupport };
}
