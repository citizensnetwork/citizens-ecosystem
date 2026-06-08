// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — frontend runtime config (EXAMPLE)
//  ------------------------------------------------------------------
//  Copy this file to `config.js` (which is gitignored) and adjust per
//  environment. It is loaded by Citizens Connect.html BEFORE the app,
//  exposing window.__CC_ENV. The Supabase anon key is PUBLIC by design
//  (Row-Level Security enforces access), so it is safe to ship.
// ════════════════════════════════════════════════════════════════════
window.__CC_ENV = {
  // Supabase project (public values — RLS enforces access).
  SUPABASE_URL: "https://xyiajtrvhlxaeplsiajj.supabase.co",
  SUPABASE_ANON_KEY: "REPLACE_WITH_YOUR_SUPABASE_ANON_KEY",

  // Where the Next.js API lives (cross-origin fetch target).
  //   Local dev:   http://localhost:3000
  //   Production:  https://citizens-connect.vercel.app   (API stays on Vercel)
  API_BASE_URL: "http://localhost:3000",

  // Optional: force the OAuth redirect origin. Leave blank to use the origin
  // the app is served from (recommended).
  //   Production frontend origin: https://www.citizenscentral.co.za
  FRONTEND_ORIGIN: "",
};

// ── Decided production topology (2026-06-07) ─────────────────────────
//  Frontend (this static app)  → https://www.citizenscentral.co.za
//  API (Next.js)               → https://citizens-connect.vercel.app
//  So a production config.js uses:
//    API_BASE_URL:    "https://citizens-connect.vercel.app"
//    FRONTEND_ORIGIN: "https://www.citizenscentral.co.za"
//  and the API project sets Vercel env ALLOWED_FRONTEND_ORIGIN to the frontend origin.
