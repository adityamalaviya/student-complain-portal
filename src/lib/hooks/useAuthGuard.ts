'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resolveRouteGuardRedirect, type RouteAccessRequirement } from '../utils';
import { useAuth } from './useAuth';

export interface UseAuthGuardOptions {
  skipRedirect?: boolean;
}

export interface UseAuthGuardResult {
  isAuthorized: boolean;
  redirectTarget: string | null;
}

/**
 * Unified declarative route guard using centralized role-first precedence:
 * Principal -> Department Admin -> Onboarded Student -> Student Onboarding -> Sign-In.
 */
export function useAuthGuard(
  requirement: RouteAccessRequirement,
  options?: UseAuthGuardOptions
): UseAuthGuardResult {
  const router = useRouter();
  const { user, profile, loading, error, isOnboarded, isAdmin, isPrincipal } = useAuth();

  const redirectTarget = resolveRouteGuardRedirect(requirement, {
    userPresent: Boolean(user),
    profile,
    isOnboarded,
    isAdmin,
    isPrincipal,
    hasError: Boolean(error),
  });

  useEffect(() => {
    if (options?.skipRedirect || loading) {
      return;
    }
    if (redirectTarget) {
      router.replace(redirectTarget);
    }
  }, [loading, options?.skipRedirect, redirectTarget, router]);

  const isAuthorized =
    !loading &&
    Boolean(user || requirement === 'guest_or_redirect') &&
    redirectTarget === null;

  return { isAuthorized, redirectTarget };
}
