// AuthContext.tsx — React auth context for Tajir.
//
// Provides login(), logout(), refreshTokens(), and the current user/tokens
// to the entire app. Wraps oidc-client-ts's UserManager.
//
// Token-based auth (no sessions): tokens live in localStorage and are
// refreshed automatically using the refresh token grant before expiry.
// No silent iframe renew — that requires SSO session cookies.
// See keycloak-mapped.md, "Sessions, refresh, and token lifespans."

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  expiresAt: number | null;
}

const AuthContext = createContext<AuthState | null>(null);

// How long before expiry to refresh the access token (seconds).
const REFRESH_BEFORE_SEC = 60;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule a refresh timer based on the access token's expiry.
  const scheduleRefresh = useCallback((u: User) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!u || !u.access_token || !u.refresh_token) return;

    const payload = decodeTokenPayload(u.access_token);
    if (!payload || !payload.exp) return;

    const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
    if (expiresIn <= 0) return; // already expired

    // Fire the refresh REFRESH_BEFORE_SEC seconds before expiry.
    const delayMs = Math.max(1000, (expiresIn - REFRESH_BEFORE_SEC) * 1000);

    console.log(`Auth: scheduling token refresh in ${Math.round(delayMs / 1000)}s (expires in ${expiresIn}s)`);

    timerRef.current = setTimeout(async () => {
      console.log('Auth: auto-refreshing token...');
      try {
        const refreshed = await refreshWithToken(u);
        setUser(refreshed);
        scheduleRefresh(refreshed);
      } catch (err) {
        console.error('Auth: auto-refresh failed, user must re-login', err);
        setError('Session expired. Please log in again.');
        setUser(null);
        await userManager.removeUser();
      }
    }, delayMs);
  }, []);

  // Clean up timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // On mount, check for existing user and handle redirect callback.
  useEffect(() => {
    (async () => {
      try {
        if (window.location.search.includes('code=')) {
          const u = await userManager.signinRedirectCallback();
          setUser(u);
          scheduleRefresh(u);
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          const u = await userManager.getUser();
          if (u && !u.expired) {
            setUser(u);
            scheduleRefresh(u);
          } else if (u && u.expired && u.refresh_token) {
            // Token expired but we have a refresh token — try to refresh.
            console.log('Auth: stored token expired, attempting refresh...');
            try {
              const refreshed = await refreshWithToken(u);
              setUser(refreshed);
              scheduleRefresh(refreshed);
            } catch {
              console.log('Auth: refresh failed, clearing stored user');
              await userManager.removeUser();
            }
          }
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('No matching state')) {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    // Listen for user-loaded events (from manual refresh).
    const onUserLoaded = (u: User) => {
      console.log('OIDC: user loaded');
      setUser(u);
      scheduleRefresh(u);
    };
    const onUserUnloaded = () => {
      console.log('OIDC: user unloaded');
      setUser(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);

    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
    };
  }, [scheduleRefresh]);

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
    if (timerRef.current) clearTimeout(timerRef.current);
    // Token-based auth (mobile pattern): no server-side session to destroy.
    // Just delete local tokens. The next login will show the form again
    // because we use prompt=login.
    await userManager.removeUser();
    setUser(null);
  }, []);

  const refreshTokens = useCallback(async () => {
    setError(null);
    if (!user) throw new Error('No user to refresh');
    try {
      const refreshed = await refreshWithToken(user);
      setUser(refreshed);
      scheduleRefresh(refreshed);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [user, scheduleRefresh]);

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

  const expiresAt = user?.expires_at ?? null;

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
    expiresAt,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Manual refresh using the refresh token grant (no sessions needed).
// ---------------------------------------------------------------------------

function decodeTokenPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

async function refreshWithToken(oldUser: User): Promise<User> {
  const refreshToken = oldUser.refresh_token;
  if (!refreshToken) throw new Error('No refresh token available');

  const clientId = 'tajir-app';
  const tokenEndpoint = 'http://keycloak.demo.local/realms/demo/protocol/openid-connect/token';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Token refresh failed: ${err.error_description || err.error || res.status}`);
  }

  const data = await res.json();

  // Build a new User object from the refresh response.
  // oidc-client-ts User has: access_token, refresh_token, id_token, expires_at, profile, etc.
  const newUser = new User({
    access_token: data.access_token,
    refresh_token: data.refresh_token || oldUser.refresh_token,
    id_token: data.id_token || oldUser.id_token,
    token_type: data.token_type || 'Bearer',
    scope: data.scope || oldUser.scope,
    expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
    profile: oldUser.profile, // preserve user profile claims
    session_state: oldUser.session_state,
  });

  // Store the refreshed user so getUser() returns it on next load.
  await userManager.storeUser(newUser);

  return newUser;
}
