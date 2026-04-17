import { parse, stringify } from '@iarna/toml';

export function pathExistsInDoc(root: unknown, path: string[]): boolean {
  let cur: unknown = root;
  for (const segment of path) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return false;
    const rec = cur as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(rec, segment)) return false;
    cur = rec[segment];
  }
  return true;
}

export function getAtPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const segment of path) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    const rec = cur as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(rec, segment)) return undefined;
    cur = rec[segment];
  }
  return cur;
}

function setAtPathExisting(root: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    cur = cur[k] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value as unknown;
}

/** Parse → clone → set path → stringify. Caller must ensure `path` already exists in the document. */
export function applyTomlFieldUpdate(raw: string, path: string[], value: unknown): string {
  const doc = parse(raw) as Record<string, unknown>;
  const next = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  if (!pathExistsInDoc(next, path)) {
    throw new Error(`Cannot update missing path: ${path.join('.')}`);
  }
  setAtPathExisting(next, path, value);
  return stringify(next as Parameters<typeof stringify>[0]);
}
