/**
 * GET /api/v1/categories
 * ----------------------------------------------------------------
 * Lists event/place categories plus a denormalised `event_count` of
 * currently-published public events per slug. Ecosystem consumers
 * (Citizens Central, directory feeds) use this to drive topic pages.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gateV1 } from '@/lib/v1Gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENT_ROW_CAP = 1000;

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: 'v1-categories' });
  if (gate.deny) return gate.deny;

  const url = new URL(request.url);
  const appliesToParam = url.searchParams.get('applies_to');
  const appliesTo =
    appliesToParam === 'events' || appliesToParam === 'places' || appliesToParam === 'both'
      ? appliesToParam
      : null;

  const supabase = await createClient();

  let q = supabase
    .from('categories')
    .select('id, name, slug, emoji, color, applies_to, sort_order')
    .order('sort_order', { ascending: true })
    // Hard cap to prevent the count fan-out from amplifying under
    // anon load (Architect audit M5).
    .limit(30);
  if (appliesTo) {
    // "events" → rows applying to events OR both
    const include =
      appliesTo === 'events'
        ? ['events', 'both']
        : appliesTo === 'places'
          ? ['places', 'both']
          : ['both'];
    q = q.in('applies_to', include);
  }

  // One read of every published public event's category, counted per
  // slug in code. It is independent of the categories read, so both run
  // together. A cache miss used to cost one count query per category.
  const [{ data: categories, error }, { data: eventRows }] = await Promise.all([
    q,
    supabase
      .from('events')
      .select('category')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .limit(EVENT_ROW_CAP),
  ]);
  if (error) {
    return NextResponse.json({ error: 'Failed to list categories' }, { status: 500 });
  }

  const rows = categories ?? [];
  let counts: number[];
  if (eventRows && eventRows.length < EVENT_ROW_CAP) {
    const bySlug = new Map<string, number>();
    for (const e of eventRows) {
      if (e.category) bySlug.set(e.category, (bySlug.get(e.category) ?? 0) + 1);
    }
    counts = rows.map((c) => bySlug.get(c.slug) ?? 0);
  } else {
    // The single read hit its row cap (or failed): a count could be
    // silently low, so fall back to exact per-category counts.
    counts = await Promise.all(
      rows.map(async (c) => {
        const { count } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .eq('visibility', 'public')
          .eq('category', c.slug);
        return count ?? 0;
      }),
    );
  }

  const data = rows.map((c, i) => ({ ...c, event_count: counts[i] }));

  return NextResponse.json(
    { data, meta: { count: data.length } },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
