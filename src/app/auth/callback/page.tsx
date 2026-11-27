'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, createSession, signOut } from '@/lib/appwrite';
import { apiGetProfile } from '@/lib/api';
import { useAuth } from '@/lib/hooks';
import { resolveAuthenticatedHomeRoute } from '@/lib/utils';

export default function AuthCallbackPage(): React.ReactElement {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [profileCheckError, setProfileCheckError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const verifyAndRedirect = useCallback(async (): Promise<void> => {
    setProfileCheckError(false);

    const profileResponse = await apiGetProfile();
    if (!isMountedRef.current) return;

    if (!profileResponse.success || !profileResponse.data) {
      console.warn('[auth-callback] Profile query failed:', profileResponse.error);
      setProfileCheckError(true);
      return;
    }

    const { profile, is_onboarded } = profileResponse.data;
    // Sync AuthProvider state silently before navigating so target route guards never flash
    await refreshProfile({ silent: true });
    if (!isMountedRef.current) return;

    const destination = resolveAuthenticatedHomeRoute({
      isPrincipal: profile?.role === 'principal',
      isAdmin: profile?.role === 'department_admin',
      isOnboarded: Boolean(is_onboarded),
    });
    router.replace(destination);
  }, [refreshProfile, router]);

  useEffect(() => {
    let isCancelled = false;

    async function handleCallback(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId');
        const secret = params.get('secret');

        // 1. Check if user already has an active session
        let user = await getCurrentUser();
        if (isCancelled || !isMountedRef.current) return;

        // 2. Exchange token parameters when no session exists or a different user was signed in
        if (userId && secret) {
          if (!user || user.$id !== userId) {
            try {
              if (user && user.$id !== userId) {
                await signOut();
              }
              await createSession(userId, secret);
              user = await getCurrentUser();
            } catch (sessionErr: unknown) {
              const errStr = String(sessionErr);
              const isAlreadyExists =
                errStr.includes('user_session_already_exists') ||
                (typeof sessionErr === 'object' &&
                  sessionErr !== null &&
                  'type' in sessionErr &&
                  (sessionErr as { type: string }).type === 'user_session_already_exists');

              if (isAlreadyExists) {
                user = await getCurrentUser();
              } else {
                console.warn('[auth-callback] Session creation from token parameters error:', sessionErr);
              }
            }
          }
        }

        if (isCancelled || !isMountedRef.current) return;

        // 3. If no active session could be verified, route back to sign-in with error
        if (!user) {
          router.replace('/sign-in?error=oauth_failed');
          return;
        }

        // 4. Verify institutional profile & hydrate AuthProvider before routing
        await verifyAndRedirect();
      } catch (err) {
        console.error('[auth-callback] Error during callback resolution:', err);
        if (!isCancelled && isMountedRef.current) {
          setProfileCheckError(true);
        }
      }
    }

    void handleCallback();

    return (): void => {
      isCancelled = true;
    };
  }, [router, verifyAndRedirect]);

  const handleRetryVerification = async (): Promise<void> => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await verifyAndRedirect();
    } catch {
      if (isMountedRef.current) {
        setProfileCheckError(true);
      }
    } finally {
      if (isMountedRef.current) {
        setIsRetrying(false);
      }
    }
  };

  const handleReturnToSignIn = async (): Promise<void> => {
    await signOut();
    router.replace('/sign-in');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-gray-950">
      <div className="flex max-w-sm flex-col items-center gap-4">
        {!profileCheckError && (
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-700 border-t-transparent dark:border-blue-400"></div>
        )}
        <div className="space-y-1">
          {profileCheckError ? (
            <>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                We could not verify your profile.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Your Google sign-in succeeded, but profile verification could not complete right now. Retry verification below or return to sign in.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void handleRetryVerification()}
                  disabled={isRetrying}
                  className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {isRetrying ? 'Retrying...' : 'Retry Verification'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReturnToSignIn()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Return to Sign-In
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Verifying institutional credentials...
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connecting with Appwrite Cloud Authentication
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
