// AuthContext.tsx — React auth context for Tajir.
//
// Provides login(), logout(), refreshTokens(), and the current user/tokens
// to the entire app. Wraps oidc-client-ts's UserManager.
//
// Token-based auth (no sessions): tokens live in localStorage and are
// refreshed silently via iframe. Logout deletes local tokens.
// See keycloak-mapped.md for the conceptual foundation.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from 'oidc-client-ts';
import { userManager } from './oidc-config';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  idToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  decodeToken: (token: string) => { header: any; payload: any } | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, check if there's an existing user session (from localStorage).
  // Also handle the redirect callback from Keycloak after login.
  useEffect(() => {
    (async () => {
      try {
        // Handle OIDC redirect callback (code -> token exchange).
        if (window.location.search.includes('code=')) {
          const u = await userManager.signinRedirectCallback();
          setUser(u);
          // Clean the URL.
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // Check for existing session.
          const u = await userManager.getUser();
          if (u && !u.expired) {
            setUser(u);
          }
        }
      } catch (err: any) {
        // Don't show error for "no existing session" — that's normal.
        if (err.message && !err.message.includes('No matching state')) {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    // Listen for silent renew completions and token changes.
    const onUserLoaded = (u: User) => {
      console.log('OIDC: user loaded/refreshed');
      setUser(u);
    };
    const onUserUnloaded = () => {
      console.log('OIDC: user unloaded');
      setUser(null);
    };
    const onSilentRenewError = (err: Error) => {
      console.error('OIDC: silent renew error', err);
      // Token refresh failed — user may need to re-login.
    };

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addSilentRenewError(onSilentRenewError);

    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeSilentRenewError(onSilentRenewError);
    };
  }, []);

  const login = useCallback(async () => {
    setError(null);
    try {
      await userManager.signinRedirect();
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      // Token-based auth: no server-side session to destroy.
      // Just remove local tokens. We still call signoutRedirect for
      // good form (it may do nothing if there's no session).
      await userManager.signoutRedirect();
    } catch {
      // Fallback: clear tokens locally.
      await userManager.removeUser();
      setUser(null);
    }
  }, []);

  const refreshTokens = useCallback(async () => {
    setError(null);
    try {
      const u = await userManager.signinSilent();
      setUser(u);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const decodeToken = useCallback((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { header, payload };
    } catch {
      return null;
    }
  }, []);

  const value: AuthState = {
    user,
    accessToken: user?.access_token ?? null,
    idToken: user?.id_token ?? null,
    refreshToken: user?.refresh_token ?? null,
    isLoading,
    error,
    login,
    logout,
    refreshTokens,
    decodeToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
