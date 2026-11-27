import { OAuthProvider, Models } from 'appwrite';
import { account } from './client';

export type AppwriteUser = Models.User<Models.Preferences>;

export async function signInWithGoogle(
  redirectSuccessUrl?: string,
  redirectFailureUrl?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  clearCachedJWT();
  const origin = window.location.origin;
  const successUrl = redirectSuccessUrl || `${origin}/auth/callback`;
  const failureUrl = redirectFailureUrl || `${origin}/sign-in?error=oauth_failed`;

  // Session Cleanup: If a session is already active, explicitly delete it
  // before starting a new OAuth flow to avoid "user_session_already_exists"
  try {
    await account.deleteSession('current');
  } catch {
    // If no session exists, deleteSession fails harmlessly
  }

  account.createOAuth2Token(OAuthProvider.Google, successUrl, failureUrl);
}

export async function createSession(userId: string, secret: string): Promise<Models.Session> {
  clearCachedJWT();
  return account.createSession(userId, secret);
}

let cachedJwt: string | null = null;
let jwtExpiresAt = 0;
let jwtGeneration = 0;
let pendingJwtPromise: Promise<string | null> | null = null;

export function clearCachedJWT(): void {
  jwtGeneration += 1;
  cachedJwt = null;
  jwtExpiresAt = 0;
  pendingJwtPromise = null;
}

export async function signOut(): Promise<void> {
  clearCachedJWT();
  try {
    await account.deleteSession('current');
  } catch (err) {
    // If session already missing, ignore
    console.warn('[auth] Sign-out warning:', err);
  }
}

export async function getCurrentUser(): Promise<AppwriteUser | null> {
  try {
    const user = await account.get();
    return user;
  } catch {
    return null;
  }
}

export async function createJWT(): Promise<string | null> {
  const now = Date.now();
  if (cachedJwt && now < jwtExpiresAt) {
    return cachedJwt;
  }

  if (pendingJwtPromise) {
    return pendingJwtPromise;
  }

  const requestGeneration = jwtGeneration;
  pendingJwtPromise = (async (): Promise<string | null> => {
    try {
      const response = await account.createJWT();
      if (requestGeneration !== jwtGeneration) {
        return null;
      }
      cachedJwt = response.jwt;
      // Cache for 10 minutes (Appwrite JWTs are valid for 15 minutes)
      jwtExpiresAt = Date.now() + 10 * 60 * 1000;
      return cachedJwt;
    } catch {
      if (requestGeneration === jwtGeneration) {
        cachedJwt = null;
        jwtExpiresAt = 0;
      }
      return null;
    } finally {
      if (requestGeneration === jwtGeneration) {
        pendingJwtPromise = null;
      }
    }
  })();

  return pendingJwtPromise;
}
