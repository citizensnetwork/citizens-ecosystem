// ════════════════════════════════════════════════════════════════════
//  Citizens Wear — frontend runtime config (LOCAL DEV TEMPLATE)
//  ------------------------------------------------------------------
//  Copy to config.js (gitignored) for local development. In production
//  scripts/build-frontend.js GENERATES config.js from env vars — never
//  commit real values here.
//
//  SUPABASE_URL / SUPABASE_ANON_KEY — the SHARED Citizens project
//  (xyiajtrvhlxaeplsiajj); the anon key is publishable by design.
//  API_BASE_URL — the Wear Next.js API origin. '' = same origin (the
//  deployed topology, where public/ is served by the same app).
//  Local dev: the static server runs on :3001 and the API on :3000.
// ════════════════════════════════════════════════════════════════════
window.__CW_ENV = {
  SUPABASE_URL: "https://xyiajtrvhlxaeplsiajj.supabase.co",
  SUPABASE_ANON_KEY: "REPLACE_WITH_ANON_KEY",
  API_BASE_URL: "http://localhost:3000",
};
