'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, createSession, signOut } from '@/lib/appwrite';
import { apiGetProfile } from '@/lib/api';

export default function AuthCallbackPage(): React.ReactElement {
  const router = useRouter();
  const [profileCheckError, setProfileCheckError] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function handleCallback(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId');
        const secret = params.get('secret');

        // 1. Check if user already has an active session
        let user = await getCurrentUser();
        if (isCancelled) return;

        // 2. If token parameters are present and either no session exists or a different user is logged in
        if (userId && secret) {
          if (!user || user.$id !== userId) {
            try {
              if (user && user.$id !== userId) {
                // Different user session active; clean up old session before creating new one
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
                console.log('[auth-callback] Active session already exists, reusing existing session.');
                user = await getCurrentUser();
              } else {
                console.warn('[auth-callback] Session creation from token parameters error:', sessionErr);
              }
            }
          } else {
            console.log('[auth-callback] Active session already exists for user:', user.$id);
          }
        }

        if (isCancelled) return;

        // 3. If no active session could be verified, route back to sign-in with error
        if (!user) {
          router.replace('/sign-in?error=oauth_failed');
          return;
        }

        // 4. Attempt to fetch existing profile from Appwrite Cloud Function
        try {
          const profileResponse = await apiGetProfile();
          if (isCancelled) return;

          console.log('[auth-callback] apiGetProfile response:', profileResponse);

          if (profileResponse.success && profileResponse.data) {
            const { profile, is_onboarded } = profileResponse.data;

            console.log('[auth-callback] profile.role raw value:', profile?.role);

            // Role check FIRST — before any onboarding check
            if (profile?.role === 'principal') {
              console.log('[auth-callback] Principal verified, routing to /principal');
              router.replace('/principal');
              return;
            }
            if (profile?.role === 'department_admin') {
              console.log('[auth-callback] Department Admin verified, routing to /admin');
              router.replace('/admin');
              return;
            }

            // Then student onboarding check
            if (is_onboarded) {
              console.log('[auth-callback] Student verified, routing to /dashboard');
              router.replace('/dashboard');
              return;
            }
          } else if (!profileResponse.success) {
            console.warn('[auth-callback] Profile query failed:', profileResponse.error);
            setProfileCheckError(true);
            return;
          }
        } catch (profileErr) {
          console.warn('[auth-callback] Profile check failed:', profileErr);
          setProfileCheckError(true);
          return;
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
                Your Google sign-in succeeded. Please refresh and try again; onboarding will open only after a confirmed profile check.
              </p>
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
