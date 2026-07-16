import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { WearStore } from '@citizens/db';
import { WearStoreError } from '@citizens/db';
import { gateApiRequest } from '@citizens/utils';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { createWearServerClient } from '@/lib/supabase/server';
import { createSupabaseWearStore } from '@/lib/supabase-wear-store';
import { getWearStore } from '@/lib/store';
import { getSession, identityFromAuthUser } from '@/lib/session';

/**
 * Request context for the Wear `/api/*` surface — the contract the standalone
 * HTML frontend (and any cross-origin client) consumes.
 *
 * Auth is resolved from **either** an `Authorization: Bearer <access_token>`
 * header **or** the Supabase auth cookies, in that order. The Bearer path is
 * the one the static HTML app uses: it holds the session in `localStorage`
 * (cross-origin), so cookie middleware sees nothing and the token must travel
 * in the header (the lesson Connect learned — memory
 * `static-frontend-cross-origin-auth`). Either way the resulting `store` is a
 * `SupabaseWearStore` bound to a `wear`-scoped client **authenticated as that
 * user**, so RLS is the wall (SHARED_DB_CONTRACT R3).
 *
 * With no Supabase env (local dev / tests / preview) it degrades to the seeded
 * in-memory store, resolving the user from the cookie session if present.
 */
/**
 * Display identity carried by the caller's session (Google OAuth metadata) —
 * the payload `POST /api/me/hydrate` writes into the `wear.users` mirror.
 */
export interface SessionIdentity {
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface RouteContext {
  readonly store: WearStore;
  /** The authenticated user's id, or `null` for an anonymous caller. */
  readonly userId: string | null;
  /** Session-derived display identity (null for anonymous callers). */
  readonly identity: SessionIdentity | null;
}

/** Extract the `Authorization: Bearer <token>` access token, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

function identityFromWearSession(
  session: {
    user: { handle: string; displayName: string; avatarUrl: string | null };
  } | null,
): SessionIdentity | null {
  if (!session) return null;
  return {
    handle: session.user.handle,
    displayName: session.user.displayName,
    avatarUrl: session.user.avatarUrl,
  };
}

export async function getRouteContext(req: Request): Promise<RouteContext> {
  const env = getSupabaseEnv();
  if (!env) {
    // Dev/test/preview: seeded in-memory store; user (if any) via cookie.
    const session = await getSession();
    return {
      store: getWearStore(),
      userId: session?.user.id ?? null,
      identity: identityFromWearSession(session),
    };
  }

  const token = bearerToken(req);
  if (token) {
    // Cross-origin HTML app: validate the token and run every query as its
    // owner. `persistSession/autoRefreshToken` off — this client is per-request.
    const client = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'wear' },
    });
    const {
      data: { user },
    } = await client.auth.getUser(token);
    return {
      store: createSupabaseWearStore(client as unknown as SupabaseClient),
      userId: user?.id ?? null,
      identity: user ? identityFromAuthUser(user) : null,
    };
  }

  // Same-origin (cookies): the wear-scoped server client already carries them.
  const client = await createWearServerClient();
  const session = await getSession();
  return {
    store: createSupabaseWearStore(client),
    userId: session?.user.id ?? null,
    identity: identityFromWearSession(session),
  };
}

/** Thrown by route handlers to short-circuit with a specific HTTP status. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Assert a signed-in caller, returning their id (or throw 401). */
export function requireUserId(ctx: RouteContext): string {
  if (!ctx.userId) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
  return ctx.userId;
}

export function json(data: unknown, init?: number | ResponseInit): NextResponse {
  const responseInit = typeof init === 'number' ? { status: init } : init;
  return NextResponse.json(data as object, responseInit);
}

/** Map a thrown error to a JSON error response with a sensible status. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof WearStoreError) {
    const status = STORE_ERROR_STATUS[error.code] ?? 400;
    return json({ error: error.code, message: error.message }, status);
  }
  const message = error instanceof Error ? error.message : 'Internal error';
  return json({ error: 'internal_error', message }, 500);
}

/**
 * Wrap an async route handler so thrown `ApiError`/`WearStoreError`/unknowns
 * become clean JSON responses. Keeps each handler focused on the happy path.
 *
 * Every wrapped route also passes the blanket `@citizens/utils` rate-limit
 * gate first (per-IP, read/write buckets — Vision's day-one pattern, closing
 * Wear debt #1): `handler()` is the single choke point the whole `/api/*`
 * surface goes through, so no endpoint can ship unlimited.
 */
export function handler(
  fn: (req: Request, ctx: RouteContext, params: RouteParams) => Promise<NextResponse>,
): (req: Request, route: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req, route) => {
    try {
      const gate = await gateApiRequest(req);
      if (gate.limited) {
        return json(
          { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
          { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
        );
      }
      const ctx = await getRouteContext(req);
      const params = route?.params ? await route.params : {};
      return await fn(req, ctx, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export type RouteParams = Record<string, string>;

/** Map store error codes to HTTP statuses (default 400). */
const STORE_ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  self_dm: 400,
  self_follow: 400,
  self_block: 400,
  post_not_found: 404,
  comment_not_found: 404,
  story_not_found: 404,
  brand_not_found: 404,
  conversation_not_found: 404,
  collection_not_found: 404,
  highlight_not_found: 404,
  not_a_member: 403,
  request_pending: 409,
  slug_taken: 409,
  invalid_cursor: 400,
  empty_post: 422,
  empty_comment: 422,
  empty_message: 422,
  empty_story: 422,
  empty_group_name: 422,
  group_too_small: 422,
  // Mig 157 — Concepts marketplace (codes mirror the SECDEF RPC raise messages)
  concept_not_found: 404,
  proposal_not_found: 404,
  claim_not_found: 404,
  obligation_not_found: 404,
  verification_not_found: 404,
  report_not_found: 404,
  empty_concept: 422,
  invalid_stage: 422,
  not_milestone: 422,
  proof_url_required: 422,
  brand_not_verified: 403,
  concept_not_open: 409,
  proposal_not_open: 409,
  proposal_exists: 409,
  verification_exists: 409,
  claim_not_active: 409,
  no_active_claim: 409,
  stage_not_forward: 409,
  not_released: 409,
  conversion_not_open: 409,
  conversion_already_open: 409,
  already_closed: 409,
  // Mig 161 — community engagement on Concepts
  status_not_found: 404,
  // Mig 162 — Become-a-Brand applications
  not_eligible: 403,
  application_pending: 409,
  application_not_open: 409,
  application_not_found: 404,
  agreements_required: 422,
  invalid_brand_name: 422,
  invalid_support_email: 422,
  invalid_contact_number: 422,
  invalid_delivery_options: 422,
  invalid_bio: 422,
  invalid_socials: 422,
  invalid_application: 422,
};
