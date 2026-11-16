import { OAuthProvider, Models } from 'appwrite';
import { account } from './client';

export type AppwriteUser = Models.User<Models.Preferences>;

export async function signInWithGoogle(
  redirectSuccessUrl?: string,
  redirectFailureUrl?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

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
  return account.createSession(userId, secret);
}

export async function signOut(): Promise<void> {
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
  try {
    const response = await account.createJWT();
    return response.jwt;
  } catch {
    return null;
  }
}
