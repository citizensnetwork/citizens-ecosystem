/**
 * Where Supabase sends the browser back to after a Google sign-in, and where the email's magic link
 * points (`webRedirectUrl` in src/frontend/auth-client.js). It is the app's root: the site root today,
 * and origin + BASE_PATH + "/" once the app is served under /citizens/connect (C39, PR B). Pinned
 * through the two public calls that use it, with a fake supabase-js client, so nothing is networked.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Call = { options: { redirectTo?: string; emailRedirectTo?: string } };
type Auth = {
  signInWithGoogle: (intent?: string) => Promise<void>;
  sendEmailCode: (email: string) => Promise<void>;
};

const src = readFileSync(join(process.cwd(), "src/frontend/auth-client.js"), "utf8");

function load(env: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const oauth: Call[] = [];
  const otp: Call[] = [];
  const client = {
    auth: {
      signInWithOAuth: async (arg: Call) => (oauth.push(arg), { data: {}, error: null }),
      signInWithOtp: async (arg: Call) => (otp.push(arg), { data: {}, error: null }),
    },
  };
  const win: Record<string, unknown> = {
    __CC_ENV: { SUPABASE_URL: "https://project.test", SUPABASE_ANON_KEY: "anon-key-for-tests", ...env },
    supabase: { createClient: () => client },
    location: { origin: "https://app.example" },
    ...extra,
  };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  new Function("window", src)(win);
  warn.mockRestore();
  return { auth: win.CC_AUTH as Auth, oauth, otp };
}

describe("the web sign-in return URL", () => {
  it("is the site root when the app is served from the root (no BASE_PATH in config.js)", async () => {
    const { auth, oauth, otp } = load({});
    await auth.signInWithGoogle();
    await auth.sendEmailCode("a@b.example");
    expect(oauth[0].options.redirectTo).toBe("https://app.example/");
    expect(otp[0].options.emailRedirectTo).toBe("https://app.example/");
  });

  it("is origin + BASE_PATH + '/' when the app is served under a prefix", async () => {
    const { auth, oauth, otp } = load({ BASE_PATH: "/citizens/connect" });
    await auth.signInWithGoogle();
    await auth.sendEmailCode("a@b.example");
    expect(oauth[0].options.redirectTo).toBe("https://app.example/citizens/connect/");
    expect(otp[0].options.emailRedirectTo).toBe("https://app.example/citizens/connect/");
  });

  it("puts the prefix after a configured FRONTEND_ORIGIN, bare hostnames included", async () => {
    const withScheme = load({ FRONTEND_ORIGIN: "https://219.example", BASE_PATH: "/citizens/connect" });
    await withScheme.auth.signInWithGoogle();
    expect(withScheme.oauth[0].options.redirectTo).toBe("https://219.example/citizens/connect/");

    const bare = load({ FRONTEND_ORIGIN: "219.example", BASE_PATH: "/citizens/connect" });
    await bare.auth.signInWithGoogle();
    expect(bare.oauth[0].options.redirectTo).toBe("https://219.example/citizens/connect/");
  });

  it("ignores a BASE_PATH that is not a string", async () => {
    const { auth, oauth } = load({ BASE_PATH: 5 });
    await auth.signInWithGoogle();
    expect(oauth[0].options.redirectTo).toBe("https://app.example/");
  });

  it("leaves the native shell's own custom-scheme redirect alone", async () => {
    const { auth, oauth } = load(
      { BASE_PATH: "/citizens/connect" },
      { CapCore: { isNativePlatform: () => true } },
    );
    await auth.signInWithGoogle();
    expect(oauth[0].options.redirectTo).toBe("citizensconnect://auth-callback");
  });
});
