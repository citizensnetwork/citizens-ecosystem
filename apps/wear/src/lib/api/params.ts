import type { PageParams } from '@citizens/db';

/** Parse `?cursor=&limit=` into store `PageParams` (bad values are dropped). */
export function readPageParams(url: URL): PageParams {
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit =
    limitRaw !== null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
  return { ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}) };
}

/** Read+trim a string field from a parsed JSON body (returns '' if absent). */
export function bodyString(body: unknown, key: string): string {
  if (body && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

/** Read a string[] field from a parsed JSON body. */
export function bodyStringArray(body: unknown, key: string): string[] {
  if (body && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/** Read a finite positive number from a parsed JSON body (else null). */
export function bodyNumber(body: unknown, key: string): number | null {
  if (body && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

/** Read a boolean field from a parsed JSON body (undefined when absent). */
export function bodyBoolean(body: unknown, key: string): boolean | undefined {
  if (body && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

/** Safely parse a request JSON body, returning `{}` on any error. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
