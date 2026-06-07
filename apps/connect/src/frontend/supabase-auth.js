// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Supabase Google Auth (handoff reference)
//  ------------------------------------------------------------------
//  This file is NOT loaded by the prototype. It documents the real
//  client wiring so the login screen in app/auth.jsx can be hooked up
//  to a live Supabase project. Google is the only enabled provider.
//
//  Install:  npm i @supabase/supabase-js
//  Env:      VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// ════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Roles ─────────────────────────────────────────────────────────
//  Every account starts as 'citizen'. 'contributor' is granted only
//  after the apply → admin-approval → onboarding flow. 'admin' is
//  never self-assigned — it is set server-side by an existing admin.
//
//  We carry the role on a `profiles` row keyed by auth user id, not in
//  the JWT, so it stays authoritative and easy to change.
//
//  -- SQL ----------------------------------------------------------
//  create type user_role as enum ('citizen','contributor','admin');
//
//  create table public.profiles (
//    id          uuid primary key references auth.users on delete cascade,
//    full_name   text,
//    avatar_url  text,
//    role        user_role not null default 'citizen',
//    -- 'contributor' intent captured at sign-up so we can route the
//    -- user straight into the application wizard after first login:
//    wants_contributor boolean not null default false,
//    created_at  timestamptz not null default now()
//  );
//  alter table public.profiles enable row level security;
//  create policy "read own profile"  on public.profiles for select using (auth.uid() = id);
//  create policy "update own profile" on public.profiles for update using (auth.uid() = id);
//
//  -- Auto-create a profile row on signup:
//  create function public.handle_new_user() returns trigger
//    language plpgsql security definer set search_path = '' as $$
//  begin
//    insert into public.profiles (id, full_name, avatar_url)
//    values (new.id, new.raw_user_meta_data->>'full_name',
//                    new.raw_user_meta_data->>'avatar_url');
//    return new;
//  end; $$;
//  create trigger on_auth_user_created
//    after insert on auth.users
//    for each row execute procedure public.handle_new_user();
//  -----------------------------------------------------------------

// ── Sign in / sign up with Google ─────────────────────────────────
//  intent: 'citizen' | 'contributor'. With OAuth, sign-in and sign-up
//  are the same call. We stash the contributor intent so that after
//  the redirect we can send a new user into the application wizard.
export async function signInWithGoogle(intent = 'citizen') {
  if (intent === 'contributor') {
    localStorage.setItem('cc_pending_intent', 'contributor');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

// ── Resolve the session + role after redirect ─────────────────────
export async function loadSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, avatar_url, wants_contributor')
    .eq('id', session.user.id)
    .single();

  // Honour a contributor sign-up: flag it once, then route to /apply.
  const pending = localStorage.getItem('cc_pending_intent');
  if (pending === 'contributor' && profile && !profile.wants_contributor) {
    await supabase.from('profiles')
      .update({ wants_contributor: true })
      .eq('id', session.user.id);
    localStorage.removeItem('cc_pending_intent');
  }

  return {
    user: session.user,
    role: profile?.role ?? 'citizen',
    routeToApply: pending === 'contributor' || profile?.wants_contributor,
  };
}

// ── Sign out ──────────────────────────────────────────────────────
export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem('cc_pending_intent');
}

// ── React to auth changes (mount once at app root) ────────────────
//  supabase.auth.onAuthStateChange((_event, session) => { ... })
//
//  In app/store.jsx the local signIn/signInDemo/signOut actions stand
//  in for these calls; swap their bodies for the functions above and
//  the rest of the app (role gating in shell.jsx, the apply flow, etc.)
//  works unchanged.
