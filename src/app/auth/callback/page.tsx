'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { account, getCurrentUser } from '@/lib/appwrite';
import { apiGetProfile } from '@/lib/api';

function AuthCallbackContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let isCancelled = false;

    async function handleCallback(): Promise<void> {
      try {
        console.log('[auth-callback] Landing on callback:', window.location.href);

        const userId = searchParams.get('userId');
        const secret = searchParams.get('secret');

        // If OAuth token flow returned userId and secret, create session directly
        if (userId && secret) {
          console.log('[auth-callback] Exchanging OAuth token for direct session. userId:', userId);
          try {
            await account.createSession(userId, secret);
            console.log('[auth-callback] Direct session established successfully!');
          } catch (sessionErr) {
            console.warn('[auth-callback] createSession note (may already exist):', sessionErr);
          }
        }

        let user = await getCurrentUser();
        if (!user) {
          // Brief retry to allow session storage to settle
          await new Promise((r) => setTimeout(r, 600));
          user = await getCurrentUser();
        }

        if (isCancelled) return;

        if (!user) {
          console.warn('[auth-callback] No active session found after OAuth token exchange.');
          router.replace(
            '/sign-in?error=no_session_found&message=' +
              encodeURIComponent('Could not establish an active session from Google credentials.')
          );
          return;
        }

        // Attempt to fetch existing profile from Appwrite Cloud Function
        try {
          const profileResponse = await apiGetProfile();
          if (isCancelled) return;

          if (profileResponse.success && profileResponse.data) {
            const { profile, is_onboarded } = profileResponse.data;

            if (profile?.role === 'department_admin') {
              router.replace('/admin');
              return;
            }

            if (is_onboarded && profile?.is_locked) {
              router.replace('/dashboard');
              return;
            }
          }
        } catch (profileErr) {
          console.warn('[auth-callback] Profile check notice, proceeding to onboarding:', profileErr);
        }

        // First-time student or profile not yet locked: route to onboarding
        router.replace('/onboarding');
      } catch (err) {
        console.error('[auth-callback] Error during callback resolution:', err);
        if (!isCancelled) {
          router.replace('/sign-in?error=oauth_failed');
        }
      }
    }

    void handleCallback();

    return (): void => {
      isCancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-700 border-t-transparent dark:border-blue-400"></div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Verifying credentials...
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Establishing secure Appwrite session
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-700 border-t-transparent dark:border-blue-400"></div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
