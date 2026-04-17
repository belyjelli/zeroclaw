import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Settings,
  Save,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Download,
  Undo2,
} from 'lucide-react';
import { putConfig } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfigTomlDraft } from '@/contexts/ConfigTomlDraftContext';
import { computeCatalogDiff } from '@/lib/configChangeSummary';
import { CONFIG_PILLAR_IDS } from '@/lib/configPillarCatalog';
import { downloadTextFile } from '@/lib/downloadTextFile';


// ---------------------------------------------------------------------------
// Lightweight zero-dependency TOML syntax highlighter.
// Produces an HTML string. The <pre> overlay sits behind the <textarea> so
// the textarea remains the editable surface; the pre just provides colour.
// ---------------------------------------------------------------------------
function highlightToml(raw: string): string {
  const lines = raw.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Section header  [section] or [[array]]
    if (/^\s*\[/.test(escaped)) {
      result.push(`<span style="color:#67e8f9;font-weight:600">${escaped}</span>`);
      continue;
    }

    // Comment line
    if (/^\s*#/.test(escaped)) {
      result.push(`<span style="color:#52525b;font-style:italic">${escaped}</span>`);
      continue;
    }

    // Key = value line
    const kvMatch = escaped.match(/^(\s*)([A-Za-z0-9_\-.]+)(\s*=\s*)(.*)$/);
    if (kvMatch) {
      const [, indent, key, eq, rawValue] = kvMatch;
      const value = colorValue(rawValue ?? '');
      result.push(
        `${indent}<span style="color:#a78bfa">${key}</span>`
        + `<span style="color:#71717a">${eq}</span>${value}`
      );
      continue;
    }

    result.push(escaped);
  }

  return result.join('\n') + '\n';
}

function colorValue(v: string): string {
  const trimmed = v.trim();
  const commentIdx = findUnquotedHash(trimmed);
  if (commentIdx !== -1) {
    const valueCore = trimmed.slice(0, commentIdx).trimEnd();
    const comment = `<span style="color:#52525b;font-style:italic">${trimmed.slice(commentIdx)}</span>`;
    const leading = v.slice(0, v.indexOf(trimmed));
    return leading + colorScalar(valueCore) + ' ' + comment;
  }
  return colorScalar(v);
}

function findUnquotedHash(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) return i;
  }
  return -1;
}

function colorScalar(v: string): string {
  const t = v.trim();
  if (t === 'true' || t === 'false')
    return `<span style="color:#34d399">${v}</span>`;
  if (/^-?\d[\d_]*(\.[\d_]*)?([eE][+-]?\d+)?$/.test(t))
    return `<span style="color:#fbbf24">${v}</span>`;
  if (t.startsWith('"') || t.startsWith("'"))
    return `<span style="color:#86efac">${v}</span>`;
  if (t.startsWith('[') || t.startsWith('{'))
    return `<span style="color:#e2e8f0">${v}</span>`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t))
    return `<span style="color:#fb923c">${v}</span>`;
  return v;
}

export default function Config() {
  const {
    toml: config,
    setWorkingToml: setConfig,
    baselineToml,
    loadState,
    loadError,
    refreshFromServer,
    isDirty,
    markSaved,
    discardLocal,
  } = useConfigTomlDraft();

  const catalogDiff = useMemo(
    () => computeCatalogDiff(baselineToml, config),
    [baselineToml, config],
  );

  const highImpactChanges = useMemo(
    () => catalogDiff.filter((e) => e.highImpact),
    [catalogDiff],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const syncScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const loading = loadState === 'loading' && config.length === 0;
  const loadFailed = loadState === 'error';

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await putConfig(config);
      markSaved(config);
      setSuccess(t('config.save_success'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('config.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportWorking = () => {
    downloadTextFile('config.toml', config, 'application/toml');
  };

  const handleDiscardAll = () => {
    if (!isDirty) return;
    if (!window.confirm(t('config.toolbar.discard_confirm'))) return;
    discardLocal();
  };

  // Auto-dismiss success after 4 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--pc-border)', borderTopColor: 'var(--pc-accent)' }} />
      </div>
    );
  }

  if (loadFailed && !config.length) {
    return (
      <div className="flex flex-col h-full p-6 gap-4 animate-fade-in">
        <p className="text-sm" style={{ color: 'var(--color-status-error)' }}>{loadError}</p>
        <button type="button" className="btn-electric text-sm px-4 py-2 w-fit" onClick={() => void refreshFromServer()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 gap-6 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" style={{ color: 'var(--pc-accent)' }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--pc-text-primary)' }}>{t('config.configuration_title')}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            type="button"
            onClick={handleExportWorking}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors"
            style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-secondary)', background: 'var(--pc-bg-surface)' }}
          >
            <Download className="h-3.5 w-3.5" />
            {t('config.toolbar.export_toml')}
          </button>
          <button
            type="button"
            onClick={handleDiscardAll}
            disabled={!isDirty}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors disabled:opacity-40"
            style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-secondary)', background: 'var(--pc-bg-surface)' }}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t('config.toolbar.discard_all')}
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-electric flex items-center gap-2 text-sm px-4 py-2">
            <Save className="h-4 w-4" />{saving ? t('config.saving') : t('config.review.apply_save')}
          </button>
        </div>
      </div>

      {isDirty && (
        <div
          className="rounded-xl border px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          style={{ borderColor: 'var(--pc-accent-dim)', background: 'var(--pc-accent-glow)', color: 'var(--pc-text-secondary)' }}
        >
          <span>{t('config.raw.unsaved_editor')}</span>
          <span className="text-xs font-mono" style={{ color: 'var(--pc-text-faint)' }}>{t('config.raw.unsaved_hint')}</span>
        </div>
      )}

      {isDirty && catalogDiff.length > 0 && (
        <details
          open
          className="rounded-2xl border overflow-hidden shrink-0"
          style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}
        >
          <summary
            className="cursor-pointer px-4 py-3 text-sm font-semibold list-none flex items-center justify-between gap-2"
            style={{ color: 'var(--pc-text-primary)' }}
          >
            <span>{t('config.summary.title')}</span>
            <span className="text-[10px] font-normal uppercase tracking-wider" style={{ color: 'var(--pc-text-faint)' }}>
              {catalogDiff.length}
            </span>
          </summary>
          <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'var(--pc-border)' }}>
            {highImpactChanges.length > 0 && (
              <div
                className="mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
                style={{ borderColor: 'rgba(255, 170, 0, 0.25)', background: 'rgba(255, 170, 0, 0.06)', color: 'var(--color-status-warning)' }}
              >
                {t('config.summary.high_impact')}
              </div>
            )}
            {CONFIG_PILLAR_IDS.map((pillar) => {
              const rows = catalogDiff.filter((e) => e.pillar === pillar);
              if (rows.length === 0) return null;
              const titleKey = `config.pillar.${pillar}.title` as const;
              return (
                <section key={pillar}>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--pc-accent-light)' }}>
                    {t(titleKey)}
                  </h3>
                  <ul className="space-y-2 text-xs font-mono">
                    {rows.map((row) => (
                      <li
                        key={`${pillar}-${row.pathStr}`}
                        className="rounded-lg border px-3 py-2"
                        style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-base)' }}
                      >
                        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--pc-text-faint)' }}>
                          {row.pathStr}
                          {row.highImpact ? ` · ${t('config.summary.impact_badge')}` : ''}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2" style={{ color: 'var(--pc-text-secondary)' }}>
                          <span className="line-through opacity-70 break-all">{row.beforeLabel}</span>
                          <span className="hidden sm:inline" aria-hidden>→</span>
                          <span className="break-all">{row.afterLabel}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </details>
      )}

      {isDirty && catalogDiff.length === 0 && (
        <p className="text-xs rounded-xl border px-3 py-2" style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-muted)' }}>
          {t('config.summary.outside_catalog')}
        </p>
      )}

      {/* Sensitive fields note */}
      <div className="flex items-start gap-3 rounded-2xl p-4 border" style={{ borderColor: 'rgba(255, 170, 0, 0.2)', background: 'rgba(255, 170, 0, 0.05)' }}>
        <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-status-warning)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-status-warning)' }}>
            {t('config.sensitive_title')}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255, 170, 0, 0.7)' }}>
            {t('config.sensitive_hint')}
          </p>
        </div>
      </div>

      {/* Success message */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl p-3 border animate-fade-in" style={{ borderColor: 'rgba(0, 230, 138, 0.2)', background: 'rgba(0, 230, 138, 0.06)' }}>
          <CheckCircle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-status-success)' }} />
          <span className="text-sm" style={{ color: 'var(--color-status-success)' }}>{success}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl p-3 border animate-fade-in" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.06)' }}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-status-error)' }} />
          <span className="text-sm" style={{ color: 'var(--color-status-error)' }}>{error}</span>
        </div>
      )}

      {/* Config Editor */}
      <div className="card overflow-hidden rounded-2xl flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-accent-glow)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--pc-text-muted)' }}>
            {t('config.toml_label')}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--pc-text-faint)' }}>
            {config.split('\n').length} {t('config.lines')}
          </span>
        </div>
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="absolute inset-0 text-sm p-4 font-mono overflow-auto whitespace-pre pointer-events-none m-0"
            style={{ background: 'var(--pc-bg-base)', tabSize: 4 }}
            dangerouslySetInnerHTML={{ __html: highlightToml(config) }}
          />
          <textarea
            ref={textareaRef}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                setConfig(config.slice(0, start) + '  ' + config.slice(end));
                requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
              }
            }}
            spellCheck={false}
            className="absolute inset-0 w-full h-full text-sm p-4 resize-none focus:outline-none font-mono caret-white"
            style={{ background: 'transparent', color: 'transparent', tabSize: 4 }}
          />
        </div>
      </div>
    </div>
  );
}
