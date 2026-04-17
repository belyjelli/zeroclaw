import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { parse } from '@iarna/toml';
import { Info, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useConfigTomlDraft } from '@/contexts/ConfigTomlDraftContext';
import { PILLAR_FIELDS, type ConfigPillarId, type PillarFieldDef } from '@/lib/configPillarCatalog';
import { applyTomlFieldUpdate, getAtPath, pathExistsInDoc } from '@/lib/configTomlMutate';
import { t } from '@/lib/i18n';

interface Props {
  pillar: ConfigPillarId;
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/** Split comma- or newline-separated tokens; trim, drop empties, dedupe in order. */
function parseListInput(raw: string): string[] {
  const parts = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function FieldLabel({
  fieldId,
  labelClass,
  labelStyle,
}: {
  fieldId: string;
  labelClass: string;
  labelStyle: CSSProperties;
}) {
  const label = t(`config.field.${fieldId}`);
  const tipKey = `config.fieldtip.${fieldId}`;
  const tip = t(tipKey);
  const hasTip = tip !== tipKey;
  return (
    <div className="flex items-center gap-2 min-h-[1.25rem]">
      <span className={labelClass} style={labelStyle}>{label}</span>
      {hasTip && (
        <span
          className="inline-flex shrink-0 cursor-help"
          style={{ color: 'var(--pc-text-faint)' }}
          title={tip}
          role="img"
          aria-label={tip}
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
    </div>
  );
}

function SliderFieldRow({
  def,
  labelClass,
  labelStyle,
  wrapClass,
  exists,
  disabledHint,
  rawVal,
  toml,
  commit,
}: {
  def: PillarFieldDef;
  labelClass: string;
  labelStyle: CSSProperties;
  wrapClass: string;
  exists: boolean;
  disabledHint: string;
  rawVal: unknown;
  toml: string;
  commit: (value: unknown) => void;
}) {
  const min = def.sliderMin ?? 0;
  const max = def.sliderMax ?? 2;
  const step = def.sliderStep ?? 0.05;
  const n = Math.min(max, Math.max(min, coerceNumber(rawVal)));
  const [txt, setTxt] = useState(() => String(n));

  useEffect(() => {
    const clamped = Math.min(max, Math.max(min, coerceNumber(rawVal)));
    setTxt(String(clamped));
  }, [rawVal, toml, min, max]);

  return (
    <div
      className={`${wrapClass} rounded-xl border px-3 py-2.5`}
      style={{
        borderColor: 'var(--pc-border)',
        background: 'var(--pc-bg-base)',
        opacity: exists ? 1 : 0.55,
      }}
      title={exists ? undefined : disabledHint}
    >
      <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={n}
          disabled={!exists}
          className="w-full sm:flex-1 accent-[var(--pc-accent)]"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) commit(v);
          }}
        />
        <input
          type="text"
          inputMode="decimal"
          className="input-electric w-full sm:w-24 shrink-0 text-sm px-3 py-1.5 rounded-xl border font-mono text-center"
          style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}
          value={txt}
          disabled={!exists}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => {
            const v = parseFloat(txt);
            if (!Number.isFinite(v)) return;
            commit(Math.min(max, Math.max(min, v)));
          }}
        />
      </div>
    </div>
  );
}

function NumberFieldRow({
  def,
  labelClass,
  labelStyle,
  wrapClass,
  exists,
  disabledHint,
  rawVal,
  toml,
  commit,
}: {
  def: PillarFieldDef;
  labelClass: string;
  labelStyle: CSSProperties;
  wrapClass: string;
  exists: boolean;
  disabledHint: string;
  rawVal: unknown;
  toml: string;
  commit: (value: unknown) => void;
}) {
  const n = coerceNumber(rawVal);
  const [txt, setTxt] = useState(() => String(n));

  useEffect(() => {
    setTxt(String(coerceNumber(rawVal)));
  }, [rawVal, toml]);

  return (
    <div
      className={`${wrapClass} rounded-xl border px-3 py-2.5`}
      style={{
        borderColor: 'var(--pc-border)',
        background: 'var(--pc-bg-base)',
        opacity: exists ? 1 : 0.55,
      }}
      title={exists ? undefined : disabledHint}
    >
      <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
      <input
        type="text"
        inputMode="decimal"
        className="input-electric w-full max-w-xs text-sm px-3 py-2 rounded-xl border font-mono"
        style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}
        value={txt}
        disabled={!exists}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={() => {
          const v = parseFloat(txt);
          if (Number.isFinite(v)) commit(v);
        }}
      />
    </div>
  );
}

function StringListFieldRow({
  def,
  labelClass,
  labelStyle,
  wrapClass,
  exists,
  disabledHint,
  rawVal,
  commit,
}: {
  def: PillarFieldDef;
  labelClass: string;
  labelStyle: CSSProperties;
  wrapClass: string;
  exists: boolean;
  disabledHint: string;
  rawVal: unknown;
  commit: (value: unknown) => void;
}) {
  const items = toStringList(rawVal);
  const max = def.listMaxItems ?? 256;
  const [draft, setDraft] = useState('');

  const addFromDraft = () => {
    if (!exists) return;
    const add = parseListInput(draft);
    if (add.length === 0) return;
    const next = [...items];
    for (const a of add) {
      if (next.length >= max) break;
      if (!next.includes(a)) next.push(a);
    }
    setDraft('');
    commit(next);
  };

  const removeAt = (idx: number) => {
    if (!exists) return;
    commit(items.filter((_, i) => i !== idx));
  };

  return (
    <div
      className={`${wrapClass} rounded-xl border px-3 py-2.5`}
      style={{
        borderColor: 'var(--pc-border)',
        background: 'var(--pc-bg-base)',
        opacity: exists ? 1 : 0.55,
      }}
      title={exists ? undefined : disabledHint}
    >
      <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
      <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
        {items.length === 0 && (
          <span className="text-xs self-center" style={{ color: 'var(--pc-text-faint)' }}>
            {t('config.list.empty_hint')}
          </span>
        )}
        {items.map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-mono max-w-full"
            style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-secondary)' }}
          >
            <span className="truncate max-w-[min(100%,18rem)]" title={item}>{item}</span>
            <button
              type="button"
              disabled={!exists}
              onClick={() => removeAt(idx)}
              className="shrink-0 rounded p-0.5 transition-opacity disabled:opacity-40 hover:opacity-80"
              style={{ color: 'var(--pc-text-muted)' }}
              aria-label={t('config.list.remove_aria')}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch mt-2">
        <input
          type="text"
          className="input-electric flex-1 text-sm px-3 py-2 rounded-xl border font-mono min-w-0"
          style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}
          placeholder={t('config.list.add_placeholder')}
          value={draft}
          disabled={!exists}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFromDraft();
            }
          }}
        />
        <button
          type="button"
          disabled={!exists || !draft.trim() || items.length >= max}
          onClick={addFromDraft}
          className="btn-electric inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl shrink-0 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('config.list.add_button')}
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  def,
  root,
  toml,
  onWorkingChange,
}: {
  def: PillarFieldDef;
  root: unknown;
  toml: string;
  onWorkingChange: (next: string) => void;
}) {
  const exists = pathExistsInDoc(root, def.path);
  const rawVal = exists ? getAtPath(root, def.path) : undefined;
  const disabledHint = t('config.pillar.not_in_toml');

  const commit = (value: unknown) => {
    if (!exists) return;
    try {
      const next = applyTomlFieldUpdate(toml, def.path, value);
      onWorkingChange(next);
    } catch (e) {
      console.error('[config pillar] apply failed', e);
    }
  };

  const wrapClass = 'flex flex-col gap-1.5';
  const labelClass = 'text-[11px] font-semibold uppercase tracking-wide';
  const labelStyle = { color: exists ? 'var(--pc-text-muted)' : 'var(--pc-text-faint)' } as const;

  if (def.kind === 'slider') {
    return (
      <SliderFieldRow
        def={def}
        labelClass={labelClass}
        labelStyle={labelStyle}
        wrapClass={wrapClass}
        exists={exists}
        disabledHint={disabledHint}
        rawVal={rawVal}
        toml={toml}
        commit={commit}
      />
    );
  }

  if (def.kind === 'boolean') {
    const checked = Boolean(rawVal);
    return (
      <label
        className={`${wrapClass} rounded-xl border px-3 py-2.5 cursor-pointer select-none`}
        style={{
          borderColor: 'var(--pc-border)',
          background: 'var(--pc-bg-base)',
          opacity: exists ? 1 : 0.55,
        }}
        title={exists ? undefined : disabledHint}
      >
        <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
        <span className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border"
            style={{ borderColor: 'var(--pc-border)', accentColor: 'var(--pc-accent)' }}
            checked={checked}
            disabled={!exists}
            onChange={(e) => commit(e.target.checked)}
          />
          <span className="text-sm" style={{ color: 'var(--pc-text-secondary)' }}>
            {checked ? t('config.field.bool_on') : t('config.field.bool_off')}
          </span>
        </span>
      </label>
    );
  }

  if (def.kind === 'number') {
    return (
      <NumberFieldRow
        def={def}
        labelClass={labelClass}
        labelStyle={labelStyle}
        wrapClass={wrapClass}
        exists={exists}
        disabledHint={disabledHint}
        rawVal={rawVal}
        toml={toml}
        commit={commit}
      />
    );
  }

  if (def.kind === 'enum' && def.enumValues) {
    const opts = def.enumValues;
    const cur = rawVal === undefined || rawVal === null ? '' : String(rawVal);
    const valid = opts.includes(cur);
    const style = def.enumStyle ?? (opts.length <= 4 ? 'segmented' : 'select');

    if (style === 'segmented') {
      return (
        <div
          className={`${wrapClass} rounded-xl border px-3 py-2.5`}
          style={{
            borderColor: 'var(--pc-border)',
            background: 'var(--pc-bg-base)',
            opacity: exists ? 1 : 0.55,
          }}
          title={exists ? undefined : disabledHint}
        >
          <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
          <div className="flex flex-wrap gap-1.5">
            {opts.map((opt) => {
              const active = exists && (valid ? cur : opts[0]) === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={!exists}
                  onClick={() => commit(opt)}
                  className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-40"
                  style={active
                    ? {
                        borderColor: 'var(--pc-accent-dim)',
                        background: 'var(--pc-accent-glow)',
                        color: 'var(--pc-accent-light)',
                      }
                    : {
                        borderColor: 'var(--pc-border)',
                        color: 'var(--pc-text-muted)',
                        background: 'transparent',
                      }}
                >
                  {opt.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`${wrapClass} rounded-xl border px-3 py-2.5`}
        style={{
          borderColor: 'var(--pc-border)',
          background: 'var(--pc-bg-base)',
          opacity: exists ? 1 : 0.55,
        }}
        title={exists ? undefined : disabledHint}
      >
        <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
        <select
          className="input-electric w-full max-w-md text-sm px-3 py-2 rounded-xl border bg-transparent"
          style={{ borderColor: 'var(--pc-border)', color: 'var(--pc-text-primary)' }}
          value={exists ? (valid ? cur : opts[0]) : ''}
          disabled={!exists}
          onChange={(e) => commit(e.target.value)}
        >
          {!exists && (
            <option value="">{t('config.pillar.enum_absent')}</option>
          )}
          {exists && opts.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (def.kind === 'string_list') {
    return (
      <StringListFieldRow
        def={def}
        labelClass={labelClass}
        labelStyle={labelStyle}
        wrapClass={wrapClass}
        exists={exists}
        disabledHint={disabledHint}
        rawVal={rawVal}
        commit={commit}
      />
    );
  }

  const str = rawVal === undefined || rawVal === null ? '' : String(rawVal);
  return (
    <div
      className={`${wrapClass} rounded-xl border px-3 py-2.5`}
      style={{
        borderColor: 'var(--pc-border)',
        background: 'var(--pc-bg-base)',
        opacity: exists ? 1 : 0.55,
      }}
      title={exists ? undefined : disabledHint}
    >
      <FieldLabel fieldId={def.id} labelClass={labelClass} labelStyle={labelStyle} />
      <input
        type="text"
        className="input-electric w-full text-sm px-3 py-2 rounded-xl border font-mono"
        style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}
        value={str}
        disabled={!exists}
        onChange={(e) => commit(e.target.value)}
      />
    </div>
  );
}

export function PillarFieldGrid({ pillar }: Props) {
  const {
    toml,
    setWorkingToml,
    loadState,
    loadError,
    refreshFromServer,
    isDirty,
    configSearchQuery,
  } = useConfigTomlDraft();

  if (loadState === 'loading' && toml.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="h-8 w-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--pc-border)', borderTopColor: 'var(--pc-accent)' }}
        />
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-base)' }}>
        <p className="text-sm" style={{ color: 'var(--color-status-error)' }}>{loadError}</p>
        <button
          type="button"
          className="btn-electric text-xs px-3 py-2 rounded-xl"
          onClick={() => void refreshFromServer()}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(toml);
  } catch {
    return (
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-base)' }}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--pc-text-secondary)' }}>
          {t('config.pillar.parse_error')}
        </p>
        <Link to="/config" className="btn-electric inline-block text-center text-xs font-semibold px-4 py-2 rounded-xl no-underline">
          {t('config.pillar.open_toml_editor')}
        </Link>
      </div>
    );
  }

  const fields = useMemo(() => {
    const all = PILLAR_FIELDS[pillar];
    const q = configSearchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((def) => {
      const label = t(`config.field.${def.id}`).toLowerCase();
      const pathStr = def.path.join('.').toLowerCase();
      const tipKey = `config.fieldtip.${def.id}`;
      const tip = t(tipKey);
      const tipMatch = tip !== tipKey && tip.toLowerCase().includes(q);
      return (
        def.id.toLowerCase().includes(q)
        || pathStr.includes(q)
        || label.includes(q)
        || tipMatch
      );
    });
  }, [pillar, configSearchQuery]);

  return (
    <div className="space-y-3">
      {isDirty && (
        <p className="text-xs rounded-lg border px-3 py-2" style={{ borderColor: 'var(--pc-accent-dim)', color: 'var(--pc-text-muted)', background: 'var(--pc-accent-glow)' }}>
          {t('config.raw.unsaved')}
        </p>
      )}
      {fields.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--pc-text-muted)' }}>{t('config.toolbar.search_empty')}</p>
      )}
      {fields.map((def) => (
        <FieldRow key={def.id} def={def} root={parsed} toml={toml} onWorkingChange={setWorkingToml} />
      ))}
    </div>
  );
}
