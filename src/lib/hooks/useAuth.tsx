'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { getCurrentUser, signInWithGoogle, signOut, type AppwriteUser } from '../appwrite';
import { apiGetProfile } from '../api';
import { hasScopeAccess, isProfileOnboarded } from '../utils';
import type { UserProfile } from '../../types';

export interface RefreshProfileOptions {
  silent?: boolean;
}

interface AuthContextValue {
  user: AppwriteUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isOnboarded: boolean;
  isAdmin: boolean;
  isPrincipal: boolean;
  hasMaintenanceScope: boolean;
  hasAcademicScope: boolean;
  signIn: () => void;
  signOutUser: () => Promise<void>;
  refreshProfile: (options?: RefreshProfileOptions) => Promise<UserProfile | null>;
  setProfileState: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchAuthAndProfile = useCallback(
    async (options?: RefreshProfileOptions): Promise<UserProfile | null> => {
      const silent = Boolean(options?.silent);
      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const currentUser = await getCurrentUser();
        if (!isMountedRef.current) {
          return null;
        }

        setUser(currentUser);

        if (!currentUser) {
          setProfile(null);
          return null;
        }

        const response = await apiGetProfile();
        if (!isMountedRef.current) {
          return null;
        }

        if (response.success && response.data) {
          setProfile(response.data.profile);
          return response.data.profile;
        }

        if (response.code === 'UNAUTHORIZED') {
          setUser(null);
          setProfile(null);
          setError(response.error || 'Session expired. Please sign in again.');
          return null;
        }

        // Preserve signed-in user across transient errors so routes can offer retry without bouncing to sign-in
        if (response.error) {
          console.warn('[useAuth] Profile retrieval issue:', response.error);
          setError(response.error);
        }
        return null;
      } catch (err: unknown) {
        if (!isMountedRef.current) {
          return null;
        }
        const msg = err instanceof Error ? err.message : 'Authentication initialization error';
        setError(msg);
        return null;
      } finally {
        if (isMountedRef.current) {
          if (silent) {
            setIsRefreshing(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/auth/callback') {
      // Let AuthCallbackPage orchestrate the OAuth token exchange before syncing AuthProvider
      setLoading(false);
      return;
    }

    void fetchAuthAndProfile();
  }, [fetchAuthAndProfile]);

  const handleSignIn = useCallback((): void => {
    signInWithGoogle();
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await signOut();
      if (isMountedRef.current) {
        setUser(null);
        setProfile(null);
        setError(null);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleSetProfileState = useCallback((newProfile: UserProfile): void => {
    setProfile(newProfile);
    setError(null);
  }, []);

  const isAdmin = Boolean(profile?.role === 'department_admin');
  const isPrincipal = Boolean(profile?.role === 'principal');
  const isOnboarded = isProfileOnboarded(profile);
  const hasMaintenanceScope =
    isAdmin && hasScopeAccess(profile?.admin_assignments, 'maintenance', profile?.department_id);
  const hasAcademicScope =
    isAdmin && hasScopeAccess(profile?.admin_assignments, 'academic', profile?.department_id);

  const contextValue: AuthContextValue = {
    user,
    profile,
    loading,
    isRefreshing,
    error,
    isOnboarded,
    isAdmin,
    isPrincipal,
    hasMaintenanceScope,
    hasAcademicScope,
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
