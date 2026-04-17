import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import React from 'react';
import {
  getToken as readToken,
  setToken as writeToken,
  clearToken as removeToken,
  isAuthenticated as checkAuth,
} from '../lib/auth';
import { pair as apiPair, getPublicHealth } from '../lib/api';
import {
  allowDashboardWithoutGatewayHealth,
  getWebDevMockSection,
  isWebDevMockActive,
} from '../lib/devMockConfig';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AuthState {
  /** The current bearer token, or null if not authenticated. */
  token: string | null;
  /** Whether the user is currently authenticated. */
  isAuthenticated: boolean;
  /** Whether the server requires pairing. Defaults to true (safe fallback). */
  requiresPairing: boolean;
  /** True while the initial auth check is in progress. */
  loading: boolean;
  /** Pair with the agent using a pairing code. Stores the token on success. */
  pair: (code: string) => Promise<void>;
  /** Clear the stored token and sign out. */
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const mockActive = isWebDevMockActive();
  /** `bun run dev`: Vite client + mock not explicitly off → dashboard without gateway /health. */
  const localDevDashboard = allowDashboardWithoutGatewayHealth();
  const openDashboard = mockActive || localDevDashboard;

  const [token, setTokenState] = useState<string | null>(readToken);
  const [authenticated, setAuthenticated] = useState<boolean>(() => openDashboard || checkAuth());
  const [requiresPairing, setRequiresPairing] = useState<boolean>(() => !openDashboard);
  const [loading, setLoading] = useState<boolean>(() => {
    if (openDashboard) return false;
    return !checkAuth();
  });

  useEffect(() => {
    if (!mockActive) return;
    const sec = getWebDevMockSection();
    if (!sec?.inject_fake_bearer_token) return;
    const t = sec.fake_bearer_token?.trim() || 'dev-mock-bearer';
    writeToken(t);
    setTokenState(t);
    setAuthenticated(true);
  }, [mockActive]);

  // On mount: check if server requires pairing at all (skipped in Vite dev unless mock is explicitly off)
  useEffect(() => {
    if (mockActive || checkAuth() || localDevDashboard) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getPublicHealth()
      .then((health) => {
        if (cancelled) return;
        if (!health.require_pairing) {
          setRequiresPairing(false);
          setAuthenticated(true);
        }
      })
      .catch(() => {
        if (import.meta.env.DEV || import.meta.hot) {
          console.info(
            "[Goctopus web] Gateway /health unreachable. If you expected a real gateway, set VITE_WEB_DEV_MOCK=0 in web/.env.development and use a Vite proxy or open the dashboard from the gateway.",
          );
        }
        // Vite dev without a gateway: /health is often HTML or 404; do not block the UI on pairing.
        if (!cancelled && allowDashboardWithoutGatewayHealth()) {
          setRequiresPairing(false);
          setAuthenticated(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mockActive, localDevDashboard]);

  // Keep state in sync if localStorage is changed in another tab
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'zeroclaw_token') {
        const t = readToken();
        setTokenState(t);
        setAuthenticated(t !== null && t.length > 0);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const pair = useCallback(async (code: string): Promise<void> => {
    const { token: newToken } = await apiPair(code);
    writeToken(newToken);
    setTokenState(newToken);
    setAuthenticated(true);
  }, []);

  const logout = useCallback((): void => {
    removeToken();
    setTokenState(null);
    if (isWebDevMockActive() || allowDashboardWithoutGatewayHealth()) {
      setAuthenticated(true);
      return;
    }
    setAuthenticated(false);
  }, []);

  const value: AuthState = {
    token,
    isAuthenticated: authenticated,
    requiresPairing,
    loading,
    pair,
    logout,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the authentication state from any component inside `<AuthProvider>`.
 * Throws if used outside the provider.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
