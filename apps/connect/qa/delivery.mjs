import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";

const sender = "no-reply@citizenscentral.co.za";
const recipient = "citizensnetworkpbo@gmail.com";
const key = process.env.QA_RESEND_KEY;
let receipt = {
  status: "pending",
  detail: "Verified domain attestation or sending key is missing.",
};

if (
  process.env.GITHUB_EVENT_NAME === "schedule" &&
  process.env.GITHUB_RUN_ATTEMPT === "1" &&
  process.env.QA_RESEND_VERIFIED_DOMAIN === "citizenscentral.co.za" &&
  key
) {
  try {
    const name = (await readdir(".qa-report")).find((file) =>
      file.endsWith(".md"),
    );
    const report = await readFile(`.qa-report/${name}`, "utf8");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `citizens-connect-qa/${process.env.GITHUB_RUN_ID}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        subject: "Citizens Connect weekly QA",
        text: report,
      }),
    });
    const body = response.ok ? await response.json() : {};
    receipt =
      response.ok &&
      typeof body.id === "string" &&
      /^[a-z0-9-]+$/i.test(body.id)
        ? {
            status: "accepted",
            providerId: body.id,
            detail: "Resend accepted the message for processing.",
          }
        : {
            status: "pending",
            detail: `No provider acceptance confirmed (HTTP ${response.status}).`,
          };
  } catch {
    receipt = {
      status: "pending",
      detail:
        "Could not confirm provider acceptance. Check Resend before any manual retry.",
    };
  }
}

await mkdir(".qa-delivery", { recursive: true });
await writeFile(
  ".qa-delivery/receipt.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Report delivery: ${receipt.status}. ${receipt.detail}\n`,
  );
}
if (receipt.status !== "accepted") process.exitCode = 1;
