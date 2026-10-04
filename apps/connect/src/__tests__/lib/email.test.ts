import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EMAIL_FROM,
  adminNotifyEmail,
  escapeHtml,
  sendEmail,
  siteOrigin,
} from "@/lib/email/send";
import {
  applicationApprovedEmail,
  applicationRejectedEmail,
  newApplicationAdminEmail,
  ownerWelcomeEmail,
} from "@/lib/email/templates";

const mail = {
  to: "owner@citizens.example",
  subject: "Hello",
  html: "<p>Hello</p>",
  text: "Hello",
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of text or an attribute", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("is safe on null, undefined and numbers", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("sendEmail", () => {
  it("is skipped, without touching the network, when RESEND_API_KEY is not set", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmail(mail)).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is skipped when there is no usable recipient", async () => {
    await expect(sendEmail({ ...mail, to: "not an email" })).resolves.toBe("skipped");
    await expect(sendEmail({ ...mail, to: "" })).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a recipient that smuggles a second address", async () => {
    await expect(sendEmail({ ...mail, to: "a@citizens.example,b@citizens.example" })).resolves.toBe("skipped");
    await expect(sendEmail({ ...mail, to: "a@citizens.example\nBcc: b@citizens.example" })).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend with the key, the fixed From address and one recipient, and reports sent", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await expect(sendEmail({ ...mail, replyTo: "Admin@Citizens.Example" })).resolves.toBe("sent");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      from: EMAIL_FROM,
      to: ["owner@citizens.example"],
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      reply_to: "admin@citizens.example",
    });
    expect(EMAIL_FROM).toContain("no-reply@citizenscentral.co.za");
  });

  it("drops an invalid reply-to rather than sending it", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await sendEmail({ ...mail, replyTo: "nope" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("reply_to");
  });

  it("flattens a subject so a line break can never become a second header", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await sendEmail({ ...mail, subject: "Hi\r\nBcc: evil@citizens.example x" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.subject).toBe("Hi Bcc: evil@citizens.example x");
  });

  it("returns failed (and does not throw) when Resend rejects the message, logging no address", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "owner@citizens.example is invalid" });
    await expect(sendEmail(mail)).resolves.toBe("failed");
    const logged = JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain("422");
    expect(logged).not.toContain("owner@citizens.example");
  });

  it("returns failed (and does not throw) when the network call itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNRESET owner@citizens.example"));
    await expect(sendEmail(mail)).resolves.toBe("failed");
    const logged = JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).not.toContain("owner@citizens.example");
  });

  it("never leaks the API key into a log line", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await sendEmail(mail);
    const logged = JSON.stringify([
      ...(console.error as ReturnType<typeof vi.fn>).mock.calls,
      ...(console.warn as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(logged).not.toContain("re_test_key");
  });
});

describe("siteOrigin", () => {
  it("prefers the configured public site URL and trims trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://connect.citizens.example//");
    expect(siteOrigin(new Request("http://localhost:3100/api/x"))).toBe("https://connect.citizens.example");
  });

  it("ignores a configured value that is not an http(s) URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "javascript:alert(1)");
    expect(siteOrigin(new Request("https://www.citizens.example/api/x"))).toBe("https://www.citizens.example");
  });

  it("falls back to the origin of the request being served", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteOrigin(new Request("https://www.citizens.example/api/x?y=1"))).toBe("https://www.citizens.example");
  });

  it("falls back to the production site with no request at all", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteOrigin()).toBe("https://www.citizenscentral.co.za");
  });
});

describe("adminNotifyEmail", () => {
  it("returns the configured address, normalised", () => {
    vi.stubEnv("ADMIN_NOTIFY_EMAIL", "  Admin@Citizens.Example ");
    expect(adminNotifyEmail()).toBe("admin@citizens.example");
  });

  it("is null when unset or not an address", () => {
    vi.stubEnv("ADMIN_NOTIFY_EMAIL", "");
    expect(adminNotifyEmail()).toBeNull();
    vi.stubEnv("ADMIN_NOTIFY_EMAIL", "not-an-email");
    expect(adminNotifyEmail()).toBeNull();
  });
});

describe("email templates", () => {
  const hostile = `<img src=x onerror="alert(1)"> & Co`;

  it("new-application email escapes the applicant's name and keeps the subject on one line", () => {
    const e = newApplicationAdminEmail({
      name: `${hostile}\r\nBcc: evil@citizens.example`,
      categoryLabel: "Church",
      area: "1 Example Road",
      siteUrl: "https://www.citizens.example",
    });
    expect(e.html).not.toContain("<img");
    expect(e.html).toContain("&lt;img");
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.subject).toContain("New Contributor application");
    expect(e.text).toContain("Church");
    expect(e.text).toContain("1 Example Road");
    expect(e.html).toContain('href="https://www.citizens.example"');
  });

  it("new-application email says so plainly when there is no category or area", () => {
    const e = newApplicationAdminEmail({ name: "Hope", categoryLabel: null, area: null, siteUrl: "https://x.example" });
    expect(e.text).toContain("No category chosen");
    expect(e.text).toContain("Online / no fixed location");
  });

  it("approved email links the listing and the portal and escapes the name and URLs", () => {
    const e = applicationApprovedEmail({
      name: hostile,
      listingUrl: 'https://www.citizens.example/c/hope"><script>',
      dashboardUrl: "https://www.citizens.example/dashboard",
    });
    expect(e.html).not.toContain("<img");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("https://www.citizens.example/dashboard");
    expect(e.text).toContain("https://www.citizens.example/dashboard");
    // The plain-text part is not HTML: the name goes in verbatim, no markup of ours.
    expect(e.text).toContain(hostile);
    expect(e.text).not.toContain("<p>");
    expect(e.subject).toContain("You're live");
  });

  describe("owner welcome email (admin-created listings)", () => {
    const input = {
      name: "Grace Hub",
      ownerEmail: "owner@grace.example",
      listingUrl: "https://www.citizens.example/c/grace-hub",
      signInUrl: "https://www.citizens.example/dashboard",
    };

    it("gives the Form's 6-digit steps: Continue with email, the code, the Dashboard, Google as the alternative", () => {
      const e = ownerWelcomeEmail(input);
      for (const part of [e.html, e.text]) {
        expect(part).toContain("Continue with email");
        expect(part).toContain("6-digit code");
        expect(part).toContain("junk folder");
        expect(part).toContain("Google");
        expect(part).toContain("Sign out, then sign in again with");
        expect(part).toContain("owner@grace.example");
      }
      expect(e.text).toContain(input.listingUrl);
      expect(e.text).toContain(input.signInUrl);
      expect(e.subject).toBe("You're live on Citizens Connect — Grace Hub");
    });

    it("says 'sign in to see your listing', never that it is automatically theirs (a confirm screen is coming)", () => {
      const e = ownerWelcomeEmail(input);
      expect(e.text).toContain("To see your listing and manage it, sign in with");
      expect((e.html + e.text).toLowerCase()).not.toContain("automatically");
      expect((e.html + e.text).toLowerCase()).not.toContain("belongs to that address");
    });

    it("escapes the name, the address and the links in the HTML part, and keeps the subject on one line", () => {
      const e = ownerWelcomeEmail({
        name: `<script>alert(1)</script>\r\nBcc: evil@citizens.example`,
        ownerEmail: 'a"b@grace.example',
        listingUrl: 'https://www.citizens.example/c/x"><script>',
        signInUrl: "https://www.citizens.example/dashboard",
      });
      expect(e.html).not.toContain("<script>");
      expect(e.html).toContain("&lt;script&gt;");
      expect(e.html).toContain("a&quot;b@grace.example");
      expect(e.subject).not.toMatch(/[\r\n]/);
    });
  });

  it("rejected email shows the reason (escaped in HTML, verbatim in text) and how to re-apply", () => {
    const reason = `Please add a real address <b>first</b> & try again`;
    const e = applicationRejectedEmail({ name: "Hope", reason, siteUrl: "https://www.citizens.example" });
    expect(e.html).toContain("Please add a real address &lt;b&gt;first&lt;/b&gt; &amp; try again");
    expect(e.html).not.toContain("<b>first</b>");
    expect(e.text).toContain(reason);
    expect(e.text).toContain("apply again");
    expect(e.subject).toBe("About your Contributor application");
  });
});
