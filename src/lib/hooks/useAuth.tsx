'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getCurrentUser, signInWithGoogle, signOut, type AppwriteUser } from '../appwrite';
import { apiGetProfile } from '../api';
import type { UserProfile } from '../../types';

interface AuthContextValue {
  user: AppwriteUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isOnboarded: boolean;
  isAdmin: boolean;
  signIn: () => void;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfileState: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAuthAndProfile = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const response = await apiGetProfile();
        if (response.success && response.data) {
          setProfile(response.data.profile);
        } else if (response.error) {
          // If profile fetch returned an error, log it
          console.warn('[useAuth] Profile retrieval issue:', response.error);
        }
      } else {
        setProfile(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication initialization error';
      setError(msg);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void (async (): Promise<void> => {
      if (isMounted) {
        await fetchAuthAndProfile();
      }
    })();

    return (): void => {
      isMounted = false;
    };
  }, [fetchAuthAndProfile]);

  const handleSignIn = useCallback((): void => {
    signInWithGoogle();
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await signOut();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSetProfileState = useCallback((newProfile: UserProfile): void => {
    setProfile(newProfile);
  }, []);

  const isOnboarded = Boolean(profile && profile.is_locked && profile.enrollment_no);
  const isAdmin = Boolean(profile?.role === 'department_admin');

  const contextValue: AuthContextValue = {
    user,
    profile,
    loading,
    error,
    isOnboarded,
    isAdmin,
    signIn: handleSignIn,
    signOutUser: handleSignOut,
    refreshProfile: fetchAuthAndProfile,
    setProfileState: handleSetProfileState,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
