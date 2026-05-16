// Server component: renders the signed-in contributor's current-month bill
// preview per FEAT-06.  Resolves the viewer from the session — never trusts
// a prop — and reads `billing_tier` / `billing_trial_started_at` through the
// `get_my_billing_context` RPC (migration 082) instead of selecting them
// directly off `profiles`, because column-level SELECT on those two columns
// is revoked from anon + authenticated.
//
// The monthly tally row is fetched via the caller's RLS-scoped client; the
// `contributor_billing` SELECT policy enforces owner-or-admin so even if a
// future caller passes the wrong user id we still cannot leak someone else's
// numbers.  Counters are written exclusively by triggers (migration 081).

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  BILLING_TIER_LABELS,
  BILLING_TIER_EVENT_RATE_ZAR,
  type BillingTier,
  type ContributorBilling,
} from "@/types/db";

const TRIAL_MONTHS = 3;

function formatZar(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function currentMonthKey(date = new Date()): string {
  // UTC so the month boundary is stable across edge runtimes / time zones.
  // The tally trigger keys off to_char(timestamptz, 'YYYY-MM') which is UTC.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addMonthsUtc(iso: string, months: number): Date {
  const d = new Date(iso);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ),
  );
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

type BillingContextRow = {
  billing_tier: BillingTier | null;
  billing_trial_started_at: string | null;
  created_at: string | null;
};

export default async function BillPreviewCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: contextRows }, { data: billingRow }] = await Promise.all([
    supabase.rpc("get_my_billing_context"),
    supabase
      .from("contributor_billing")
      .select("profile_id, month, event_count, place_count, calculated_total, updated_at")
      .eq("profile_id", user.id)
      .eq("month", currentMonthKey())
      .maybeSingle<ContributorBilling>(),
  ]);

  // RPC returns a 1-row table.  Tolerate undefined / empty so the card never
  // explodes during a transient auth blip.
  const ctx: BillingContextRow | null =
    Array.isArray(contextRows) && contextRows.length
      ? (contextRows[0] as BillingContextRow)
      : null;

  const tier: BillingTier = ctx?.billing_tier ?? "individual";
  const tierLabel = BILLING_TIER_LABELS[tier];
  const tierRate = BILLING_TIER_EVENT_RATE_ZAR[tier];

  const eventCount = billingRow?.event_count ?? 0;
  const placeCount = billingRow?.place_count ?? 0;
  const monthTotal = Number(billingRow?.calculated_total ?? 0);

  const trialStartIso = ctx?.billing_trial_started_at ?? ctx?.created_at ?? null;
  const trialEnd = trialStartIso ? addMonthsUtc(trialStartIso, TRIAL_MONTHS) : null;
  const trialActive = !!trialEnd && trialEnd.getTime() > Date.now();
  const dueThisMonth = trialActive ? 0 : monthTotal;

  return (
    <section
      aria-labelledby="bill-preview-heading"
      className="glass-panel mt-6 w-full px-5 py-5 sm:px-6 sm:py-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bill-preview-heading" className="text-lg font-semibold">
          Bill preview &middot; this month
        </h2>
        <span className="text-xs uppercase tracking-wide text-black/55">
          {currentMonthKey()}
        </span>
      </div>

      {trialActive && trialEnd && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <strong className="font-semibold">First 3 months free.</strong>{" "}
          Billing starts <span className="whitespace-nowrap">{formatLongDate(trialEnd)}</span>.
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-black/10 bg-white/60 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-black/55">Events posted</dt>
          <dd className="mt-1 text-xl font-semibold">{eventCount}</dd>
        </div>
        <div className="rounded-lg border border-black/10 bg-white/60 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-black/55">Places listed</dt>
          <dd className="mt-1 text-xl font-semibold">{placeCount}</dd>
        </div>
        <div className="rounded-lg border border-black/10 bg-white/60 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-black/55">Tier</dt>
          <dd className="mt-1 text-sm font-semibold">{tierLabel}</dd>
          <dd className="text-[11px] text-black/55">{formatZar(tierRate)} per event</dd>
        </div>
        <div className="rounded-lg border border-black/10 bg-white/60 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-black/55">Due this month</dt>
          <dd className="mt-1 text-xl font-semibold">
            {formatZar(dueThisMonth)}
            {trialActive && monthTotal > 0 && (
              <span className="ml-1 text-xs font-normal text-black/55">
                ({formatZar(monthTotal)} after trial)
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/55">
          Counters update when you publish an event or place. Place pricing is flat-rate and not
          yet billed.
        </p>
        <Link
          href="/profile/contributor/billing/setup"
          className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85"
        >
          Set up billing →
        </Link>
      </div>
    </section>
  );
}
