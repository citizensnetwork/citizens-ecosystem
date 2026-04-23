import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms & Community Agreement — Citizens Connect",
  description:
    "The terms, community guidelines, and liability framework for Citizens Connect members, organisers, and contributors.",
};

export default async function TermsPage() {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("indemnity_templates")
    .select("title, body, version, updated_at")
    .eq("slug", "platform-terms-v1")
    .single();

  const title = template?.title ?? "Terms & Community Agreement";
  const body = template?.body ?? "";
  const version = template?.version ?? 1;
  const updatedAt = template?.updated_at
    ? new Date(template.updated_at).toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen bg-white px-6 py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/events"
          className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Back to Citizens Connect
        </Link>

        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
          {title}
        </h1>
        <p className="mb-10 text-sm text-neutral-500">
          Version {version}
          {updatedAt ? ` · Last updated ${updatedAt}` : null}
        </p>

        {body ? (
          <article className="max-w-none whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800">
            {body}
          </article>
        ) : (
          <p className="text-neutral-600">
            The current terms are being finalised. Please check back shortly.
          </p>
        )}

        <div className="mt-12 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-700">
          <p className="mb-2 font-semibold text-neutral-900">Questions or concerns?</p>
          <p>
            Reach the team at{" "}
            <a
              href="mailto:citizensnetworkpbo@gmail.com"
              className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
            >
              citizensnetworkpbo@gmail.com
            </a>
            . We review every message.
          </p>
        </div>
      </div>
    </main>
  );
}
