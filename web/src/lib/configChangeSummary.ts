import { parse } from '@iarna/toml';
import { CONFIG_PILLAR_IDS, PILLAR_FIELDS, type ConfigPillarId } from '@/lib/configPillarCatalog';
import { getAtPath, pathExistsInDoc } from '@/lib/configTomlMutate';

function stableStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));
  } catch {
    return String(v);
  }
}

function formatValue(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return stableStringify(v);
}

/** Paths that warrant an extra confirmation banner before save (design: autonomy, sandbox, gateway, runtime). */
const HIGH_IMPACT_ROOTS = new Set([
  'autonomy',
  'security',
  'runtime',
  'gateway',
  'cost',
  'browser',
  'http_request',
  'web_fetch',
  'web_search',
  'mcp',
  'mcp_serve',
  'shell_tool',
]);

export function isHighImpactPath(path: string[]): boolean {
  const head = path[0];
  return !!head && HIGH_IMPACT_ROOTS.has(head);
}

export interface CatalogDiffEntry {
  pillar: ConfigPillarId;
  fieldId: string;
  path: string[];
  pathStr: string;
  beforeLabel: string;
  afterLabel: string;
  highImpact: boolean;
}

/** Compare baseline vs working for every catalogued field across pillars. */
export function computeCatalogDiff(baselineToml: string, workingToml: string): CatalogDiffEntry[] {
  let base: unknown;
  let work: unknown;
  try {
    base = parse(baselineToml);
    work = parse(workingToml);
  } catch {
    return [];
  }

  const out: CatalogDiffEntry[] = [];
  for (const pillar of CONFIG_PILLAR_IDS) {
    for (const f of PILLAR_FIELDS[pillar]) {
      const inB = pathExistsInDoc(base, f.path);
      const inW = pathExistsInDoc(work, f.path);
      const vb = inB ? getAtPath(base, f.path) : undefined;
      const vw = inW ? getAtPath(work, f.path) : undefined;
      if (stableStringify(vb) === stableStringify(vw)) continue;
      out.push({
        pillar,
        fieldId: f.id,
        path: f.path,
        pathStr: f.path.join('.'),
        beforeLabel: inB ? formatValue(vb) : '—',
        afterLabel: inW ? formatValue(vw) : '—',
        highImpact: isHighImpactPath(f.path),
      });
    }
  }
  return out;
}

export function pillarHasDraftChanges(
  baselineToml: string,
  workingToml: string,
  pillar: ConfigPillarId,
): boolean {
  return computeCatalogDiff(baselineToml, workingToml).some((e) => e.pillar === pillar);
}
