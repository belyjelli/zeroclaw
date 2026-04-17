import { Link, Navigate, useParams } from 'react-router-dom';
import { t } from '@/lib/i18n';
import { CONFIG_PILLAR_IDS, type ConfigPillarId } from '@/lib/configPillarCatalog';
import { PillarFieldGrid } from '@/pages/config/PillarFieldGrid';

function isPillarId(s: string | undefined): s is ConfigPillarId {
  return !!s && (CONFIG_PILLAR_IDS as readonly string[]).includes(s);
}

const PILLAR_THEME: Record<ConfigPillarId, { accent: string; glow: string }> = {
  llm: { accent: 'rgba(59, 130, 246, 0.95)', glow: 'rgba(59, 130, 246, 0.12)' },
  security: { accent: 'rgba(239, 68, 68, 0.95)', glow: 'rgba(239, 68, 68, 0.1)' },
  agent: { accent: 'rgba(168, 85, 247, 0.95)', glow: 'rgba(168, 85, 247, 0.12)' },
  memory: { accent: 'rgba(20, 184, 166, 0.95)', glow: 'rgba(20, 184, 166, 0.12)' },
  runtime: { accent: 'rgba(249, 115, 22, 0.95)', glow: 'rgba(249, 115, 22, 0.12)' },
};

export default function ConfigPillarPage() {
  const { pillar } = useParams<{ pillar: string }>();

  if (!isPillarId(pillar)) {
    return <Navigate to="/config/llm" replace />;
  }

  const theme = PILLAR_THEME[pillar];
  const titleKey = `config.pillar.${pillar}.title` as const;
  const descKey = `config.pillar.${pillar}.desc` as const;

  return (
    <div className="flex flex-col h-full p-6 gap-6 animate-fade-in overflow-hidden min-h-0">
      <header
        className="rounded-2xl border px-5 py-4 shrink-0"
        style={{
          borderColor: 'var(--pc-border)',
          background: `linear-gradient(135deg, ${theme.glow}, transparent)`,
        }}
      >
        <h1
          className="text-base font-semibold tracking-wide uppercase"
          style={{ color: theme.accent }}
        >
          {t(titleKey)}
        </h1>
        <p className="text-sm mt-1.5 leading-relaxed max-w-3xl" style={{ color: 'var(--pc-text-muted)' }}>
          {t(descKey)}
        </p>
      </header>

      <section
        className="card rounded-2xl border flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}
      >
        <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--pc-border)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--pc-text-faint)' }}>
            {t('config.pillar.controls_label')}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          <div
            className="rounded-xl border px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-base)' }}
          >
            <p className="leading-relaxed" style={{ color: 'var(--pc-text-secondary)' }}>
              {t('config.pillar.save_hint')}
            </p>
            <Link
              to="/config"
              className="btn-electric text-center text-xs font-semibold px-4 py-2 rounded-xl shrink-0 no-underline"
            >
              {t('config.pillar.open_toml_editor')}
            </Link>
          </div>
          <PillarFieldGrid pillar={pillar} />
        </div>
      </section>
    </div>
  );
}
