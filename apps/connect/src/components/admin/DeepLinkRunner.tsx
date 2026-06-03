"use client";

// Client wrapper that auto-submits the email-deep-link action on
// mount. Used on /admin/contributors/[id] when the URL carries
// ?action=approve|reject&sig=...&exp=... — i.e. the admin clicked a
// button in the review email.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DeepLinkRunner(props: {
  applicationId: string;
  action: "approve" | "reject";
  sig: string;
  exp: string;
}) {
  const router = useRouter();
  const ran = useRef(false);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (props.action !== "approve") return;
    if (ran.current) return;
    ran.current = true;
    void fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fire = async (reason?: string) => {
    setState("working");
    try {
      const res = await fetch("/api/admin/contributors/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: props.applicationId,
          action: props.action,
          sig: props.sig,
          exp: props.exp,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(
          typeof data.error === "string"
            ? data.error.replace(/_/g, " ")
            : "Review failed.",
        );
        return;
      }
      setState("done");
      setMessage(
        props.action === "approve"
          ? "Approved. The applicant has been notified."
          : "Rejected. The applicant has been notified.",
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      setState("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (props.action === "reject") {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="text-base font-semibold text-black">Reject application</h2>
        <p className="mt-1 text-sm text-black/60">
          Add a short reason — it&rsquo;s sent to the applicant.
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
          maxLength={600}
          className="mt-3 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm focus:border-(--gold,#C9A84C) focus:outline-none focus:ring-1 focus:ring-(--gold,#C9A84C)"
        />
        {state === "error" && (
          <p className="mt-2 text-sm text-red-700">{message}</p>
        )}
        {state === "done" ? (
          <p className="mt-3 text-sm text-green-700">{message}</p>
        ) : (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={state === "working" || rejectReason.trim().length < 5}
              onClick={() => fire(rejectReason.trim())}
              className="rounded-lg bg-black px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {state === "working" ? "Rejecting…" : "Confirm reject"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 ${
        state === "error"
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-black/10 bg-white text-black"
      }`}
    >
      {state === "working" ? "Approving…" : null}
      {state === "done" ? message : null}
      {state === "error" ? message : null}
    </div>
  );
}
