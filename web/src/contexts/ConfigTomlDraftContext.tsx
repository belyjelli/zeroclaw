import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getConfig } from '@/lib/api';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ConfigTomlDraftContextValue {
  toml: string;
  baselineToml: string;
  loadState: LoadState;
  loadError: string | null;
  isDirty: boolean;
  /** Filters pillar field labels / paths (global config search). */
  configSearchQuery: string;
  setConfigSearchQuery: (q: string) => void;
  setWorkingToml: (next: string) => void;
  /** Drop local edits and match the last loaded/saved baseline. */
  discardLocal: () => void;
  refreshFromServer: () => Promise<void>;
  /** Call after a successful `putConfig` with the body that was saved. */
  markSaved: (savedToml: string) => void;
}

const ConfigTomlDraftContext = createContext<ConfigTomlDraftContextValue | null>(null);

export function ConfigTomlDraftProvider({ children }: { children: ReactNode }) {
  const [toml, setToml] = useState('');
  const [baselineToml, setBaselineToml] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configSearchQuery, setConfigSearchQuery] = useState('');

  const refreshFromServer = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const s = await getConfig();
      setToml(s);
      setBaselineToml(s);
      setLoadState('ready');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load configuration');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  const markSaved = useCallback((savedToml: string) => {
    setToml(savedToml);
    setBaselineToml(savedToml);
  }, []);

  const isDirty = toml !== baselineToml;

  const discardLocal = useCallback(() => {
    setToml(baselineToml);
  }, [baselineToml]);

  const value = useMemo<ConfigTomlDraftContextValue>(
    () => ({
      toml,
      baselineToml,
      loadState,
      loadError,
      isDirty,
      configSearchQuery,
      setConfigSearchQuery,
      setWorkingToml: setToml,
      discardLocal,
      refreshFromServer,
      markSaved,
    }),
    [
      toml,
      baselineToml,
      loadState,
      loadError,
      isDirty,
      configSearchQuery,
      discardLocal,
      refreshFromServer,
      markSaved,
    ],
  );

  return (
    <ConfigTomlDraftContext.Provider value={value}>{children}</ConfigTomlDraftContext.Provider>
  );
}

export function useConfigTomlDraft(): ConfigTomlDraftContextValue {
  const ctx = useContext(ConfigTomlDraftContext);
  if (!ctx) {
    throw new Error('useConfigTomlDraft must be used within ConfigTomlDraftProvider');
  }
  return ctx;
}
