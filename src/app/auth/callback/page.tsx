'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, createSession } from '@/lib/appwrite';
import { apiGetProfile } from '@/lib/api';

export default function AuthCallbackPage(): React.ReactElement {
  const router = useRouter();

  useEffect(() => {
    let isCancelled = false;

    async function handleCallback(): Promise<void> {
      try {
        // 1. Extract userId and secret from URL search parameters if redirected from createOAuth2Token
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId');
        const secret = params.get('secret');

        if (userId && secret) {
          try {
            await createSession(userId, secret);
          } catch (sessionErr) {
            console.warn('[auth-callback] Session creation from token parameters error:', sessionErr);
          }
        }

        // 2. Retrieve authenticated user session
        const user = await getCurrentUser();
        if (isCancelled) return;

        if (!user) {
          router.replace('/sign-in?error=oauth_failed');
          return;
        }

        // 3. Attempt to fetch existing profile from Appwrite Cloud Function
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
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-700 border-t-transparent dark:border-blue-400"></div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Verifying institutional credentials...
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Connecting with Appwrite Cloud Authentication
          </p>
        </div>
      </div>
    </div>
  );
}
