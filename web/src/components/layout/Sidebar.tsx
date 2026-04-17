import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { staticAssetBase } from '../../lib/basePath';
import {
  LayoutDashboard,
  MessageSquare,
  Wrench,
  Clock,
  Puzzle,
  Brain,
  Settings,
  DollarSign,
  Activity,
  Stethoscope,
  Monitor,
  ChevronLeft,
  FileCode,
  Cpu,
  Shield,
  Zap,
  Database,
  Boxes,
  Search,
  Download,
  Undo2,
  ClipboardList,
} from 'lucide-react';
import { t } from '@/lib/i18n';
import { CONFIG_PILLAR_IDS, type ConfigPillarId } from '@/lib/configPillarCatalog';
import { pillarHasDraftChanges } from '@/lib/configChangeSummary';
import { useConfigTomlDraft } from '@/contexts/ConfigTomlDraftContext';
import { downloadTextFile } from '@/lib/downloadTextFile';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/agent', icon: MessageSquare, labelKey: 'nav.agent' },
  { to: '/tools', icon: Wrench, labelKey: 'nav.tools' },
  { to: '/cron', icon: Clock, labelKey: 'nav.cron' },
  { to: '/integrations', icon: Puzzle, labelKey: 'nav.integrations' },
  { to: '/memory', icon: Brain, labelKey: 'nav.memory' },
  { to: '/cost', icon: DollarSign, labelKey: 'nav.cost' },
  { to: '/logs', icon: Activity, labelKey: 'nav.logs' },
  { to: '/doctor', icon: Stethoscope, labelKey: 'nav.doctor' },
  { to: '/canvas', icon: Monitor, labelKey: 'nav.canvas' },
] as const;

const pillarNavItems: { id: ConfigPillarId; icon: typeof Cpu; labelKey: string }[] = [
  { id: 'llm', icon: Cpu, labelKey: 'nav.config_pillar_llm' },
  { id: 'security', icon: Shield, labelKey: 'nav.config_pillar_security' },
  { id: 'agent', icon: Zap, labelKey: 'nav.config_pillar_agent' },
  { id: 'memory', icon: Database, labelKey: 'nav.config_pillar_memory' },
  { id: 'runtime', icon: Boxes, labelKey: 'nav.config_pillar_runtime' },
];

function isConfigSectionPath(pathname: string): boolean {
  return pathname === '/config' || pathname.startsWith('/config/');
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const {
    toml,
    baselineToml,
    isDirty,
    configSearchQuery,
    setConfigSearchQuery,
    discardLocal,
    refreshFromServer,
  } = useConfigTomlDraft();

  const pillarDirty = useMemo(() => {
    const m: Record<ConfigPillarId, boolean> = {
      llm: false,
      security: false,
      agent: false,
      memory: false,
      runtime: false,
    };
    for (const id of CONFIG_PILLAR_IDS) {
      m[id] = pillarHasDraftChanges(baselineToml, toml, id);
    }
    return m;
  }, [baselineToml, toml]);

  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const onConfig = isConfigSectionPath(pathname);
    const prev = prevPathRef.current;
    if (!onConfig) {
      setConfigPanelOpen(false);
    } else if (!prev || !isConfigSectionPath(prev)) {
      setConfigPanelOpen(true);
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  const openConfigPanel = () => setConfigPanelOpen(true);
  const closeConfigPanel = () => setConfigPanelOpen(false);

  const onConfig = isConfigSectionPath(pathname);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all group',
      isActive
        ? 'text-[var(--pc-accent-light)]'
        : 'text-[var(--pc-text-muted)] hover:text-[var(--pc-text-secondary)] hover:bg-[var(--pc-hover)]',
    ].join(' ');

  const navLinkStyle = (isActive: boolean, idx: number) => ({
    animationDelay: `${idx * 40}ms`,
    ...(isActive ? {
      background: 'var(--pc-accent-glow)',
      border: '1px solid var(--pc-accent-dim)',
    } : {}),
  });

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 flex flex-col border-r" style={{ background: 'var(--pc-bg-base)', borderColor: 'var(--pc-border)' }}>
      {/* Logo / Title */}
      <div className="flex items-center gap-3 px-4 py-4 border-b h-14 shrink-0" style={{ borderColor: 'var(--pc-border)' }}>
        <div className="relative shrink-0">
          <div className="absolute -inset-1.5 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(var(--pc-accent-rgb), 0.15), rgba(var(--pc-accent-rgb), 0.05))' }} />
          <img
            src={`${staticAssetBase}/zeroclaw-trans.png`}
            alt="Goctopus"
            className="relative h-9 w-9 rounded-xl object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = 'none';
            }}
          />
        </div>
        <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--pc-text-primary)' }}>
          Goctopus
        </span>
      </div>

      {/* Sliding nav: main list | configuration submenu (same total width w-60) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          className={[
            'flex h-full w-[480px] shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
            configPanelOpen ? '-translate-x-1/2' : 'translate-x-0',
          ].join(' ')}
        >
          {/* Panel 1 — main navigation */}
          <div className="w-60 shrink-0 flex flex-col min-h-0 h-full">
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {mainNavItems.map(({ to, icon: Icon, labelKey }, idx) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={navLinkClass}
                  style={({ isActive }) => navLinkStyle(isActive, idx)}
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-[var(--pc-accent)]' : 'group-hover:text-[var(--pc-accent)]'}`} />
                      <span>{t(labelKey)}</span>
                    </>
                  )}
                </NavLink>
              ))}

              {/* Configuration — opens slide submenu */}
              <button
                type="button"
                onClick={openConfigPanel}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all text-left group',
                  configPanelOpen || onConfig
                    ? 'text-[var(--pc-accent-light)]'
                    : 'text-[var(--pc-text-muted)] hover:text-[var(--pc-text-secondary)] hover:bg-[var(--pc-hover)]',
                ].join(' ')}
                style={configPanelOpen || onConfig ? {
                  background: 'var(--pc-accent-glow)',
                  border: '1px solid var(--pc-accent-dim)',
                } : {}}
              >
                <Settings className={`h-5 w-5 flex-shrink-0 transition-colors ${configPanelOpen || onConfig ? 'text-[var(--pc-accent)]' : 'group-hover:text-[var(--pc-accent)]'}`} />
                <span>{t('nav.config')}</span>
              </button>
            </nav>

            <div className="px-5 py-4 border-t text-[10px] uppercase tracking-wider shrink-0" style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-faint)' }}>
              Goctopus Runtime
            </div>
          </div>

          {/* Panel 2 — configuration submenu */}
          <div className="w-60 shrink-0 flex flex-col min-h-0 h-full border-l" style={{ borderColor: 'var(--pc-border)' }}>
            <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 flex flex-col gap-1" aria-label={t('nav.config')}>
              <div className="shrink-0 mb-3">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                    style={{ color: 'var(--pc-text-faint)' }}
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={configSearchQuery}
                    onChange={(e) => setConfigSearchQuery(e.target.value)}
                    placeholder={t('config.toolbar.search_placeholder')}
                    className="w-full rounded-xl border py-2 pl-8 pr-2 text-xs outline-none focus:border-[var(--pc-accent-dim)]"
                    style={{
                      borderColor: 'var(--pc-border)',
                      background: 'var(--pc-bg-surface)',
                      color: 'var(--pc-text-primary)',
                    }}
                    aria-label={t('config.toolbar.search_placeholder')}
                  />
                </div>
              </div>
              <div className="flex items-stretch gap-1.5 mb-2 shrink-0">
                <button
                  type="button"
                  onClick={closeConfigPanel}
                  title={t('nav.back')}
                  className="flex items-center justify-center w-11 shrink-0 rounded-2xl text-sm font-medium transition-all text-[var(--pc-text-muted)] hover:text-[var(--pc-text-secondary)] hover:bg-[var(--pc-hover)] group"
                  aria-label={t('nav.back')}
                >
                  <ChevronLeft className="h-5 w-5 group-hover:text-[var(--pc-accent)]" />
                </button>
                <NavLink
                  to="/config"
                  end
                  className={({ isActive }) =>
                    [
                      'flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all group',
                      isActive
                        ? 'text-[var(--pc-accent-light)]'
                        : 'text-[var(--pc-text-muted)] hover:text-[var(--pc-text-secondary)] hover:bg-[var(--pc-hover)]',
                    ].join(' ')
                  }
                  style={({ isActive }) => navLinkStyle(isActive, 0)}
                >
                  {({ isActive }) => (
                    <>
                      <FileCode className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-[var(--pc-accent)]' : 'group-hover:text-[var(--pc-accent)]'}`} />
                      <span className="truncate">{t('nav.config_toml')}</span>
                    </>
                  )}
                </NavLink>
              </div>

              <div
                className="mx-1 my-2 h-px"
                style={{ background: 'var(--pc-border)' }}
                role="separator"
              />

              {pillarNavItems.map(({ id, icon: Icon, labelKey }, idx) => (
                <NavLink
                  key={id}
                  to={`/config/${id}`}
                  className={navLinkClass}
                  style={({ isActive }) => navLinkStyle(isActive, idx + 1)}
                >
                  {({ isActive }) => (
                    <span className="flex w-full items-center gap-3">
                      <Icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-[var(--pc-accent)]' : 'group-hover:text-[var(--pc-accent)]'}`} />
                      <span className="min-w-0 flex-1 leading-snug">{t(labelKey)}</span>
                      {pillarDirty[id] && (
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ background: 'var(--color-status-warning)' }}
                          title={t('config.raw.unsaved')}
                          aria-label={t('config.raw.unsaved')}
                        />
                      )}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="shrink-0 border-t px-3 py-3 flex flex-col gap-2" style={{ borderColor: 'var(--pc-border)' }}>
              <NavLink
                to="/config"
                className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold no-underline transition-colors"
                style={{
                  borderColor: 'var(--pc-accent-dim)',
                  background: isDirty ? 'var(--pc-accent-glow)' : 'transparent',
                  color: isDirty ? 'var(--pc-accent-light)' : 'var(--pc-text-muted)',
                }}
              >
                <ClipboardList className="h-3.5 w-3.5 flex-shrink-0" />
                {t('config.toolbar.review_all')}
              </NavLink>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
                style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-secondary)', background: 'var(--pc-bg-surface)' }}
                onClick={() => downloadTextFile('config.toml', toml, 'application/toml')}
              >
                <Download className="h-3.5 w-3.5 flex-shrink-0" />
                {t('config.toolbar.export_toml')}
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
                style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-secondary)', background: 'var(--pc-bg-surface)' }}
                onClick={() => {
                  if (!isDirty) {
                    if (window.confirm(t('config.toolbar.reload_confirm'))) void refreshFromServer();
                    return;
                  }
                  if (window.confirm(t('config.toolbar.discard_confirm'))) discardLocal();
                }}
              >
                <Undo2 className="h-3.5 w-3.5 flex-shrink-0" />
                {t('config.toolbar.reset_all')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
