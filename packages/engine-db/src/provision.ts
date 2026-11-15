/**
 * Provisioning a tenant project is more than SQL. This file writes the whole list down as data,
 * in order, so a runbook, a console (step E6) or a person can follow it, and so nothing that
 * differs per tenant is ever copied from another project.
 *
 * It builds a plan; it changes nothing. The SQL it gives is run by the engine owner's tooling as
 * the database owner. Steps marked "blocked" cannot be done yet, and say what they wait for.
 */

import type { Allowlist } from './allowlist.ts';

export type StepKind = 'founder' | 'tool' | 'sql' | 'settings' | 'secret' | 'blocked' | 'check';

export interface ProvisioningStep {
  readonly id: string;
  readonly kind: StepKind;
  readonly title: string;
  readonly detail: string;
  /** SQL to run as the database owner, when the step is SQL. */
  readonly sql?: string;
}

export interface ProvisioningInput {
  /** The project's own API address, for example https://<project>.supabase.co. Per tenant. */
  readonly projectUrl: string;
  /** The project's publishable key. Never the secret key. */
  readonly publishableKey: string;
  /** The world's own address, for example https://world.example. */
  readonly siteUrl: string;
  /** What the engine owner allows this world (the entitlements document). */
  readonly entitlements: unknown;
}

export const sqlLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`;

const HTTPS_ORIGIN_RE = /^https:\/\/[A-Za-z0-9.-]+$/;

/** The secrets the edge functions read. Each is set per tenant; none has a default. */
export const FUNCTION_SECRETS: readonly {
  readonly name: string;
  readonly what: string;
  readonly when?: string;
}[] = [
  { name: 'RESEND_API_KEY', what: "The tenant's own email sending key." },
  {
    name: 'RESEND_FROM',
    what: "The sender shown on the world's emails, on the tenant's own domain.",
  },
  { name: 'PUBLIC_SITE_URL', what: "The world's own address, used in links." },
  { name: 'ADMIN_REVIEW_EMAIL', what: "Where the tenant's staff get review notices." },
  {
    name: 'FCM_SERVICE_ACCOUNT_JSON',
    what: 'Push notifications, in the tenant’s own messaging project.',
    when: 'only when push notifications are used',
  },
  {
    name: 'CONTRIBUTOR_REVIEW_SECRET',
    what: 'Signs the links in application review emails.',
    when: 'only while open partner applications are switched on',
  },
];

/** The sign-in settings of a tenant project (ADR-001, decision 2). Set per project, never copied. */
export const SIGN_IN_SETTINGS: readonly { readonly setting: string; readonly value: string }[] = [
  { setting: 'Site URL', value: "the world's own address" },
  { setting: 'Redirect allow-list', value: "the world's own address and nothing else" },
  { setting: 'Email sign-in', value: 'on, by 6-digit code' },
  {
    setting: 'Google sign-in',
    value: 'off, unless the world has the feature and its own Google client',
  },
  { setting: 'Email sender (SMTP)', value: "the tenant's own sending domain" },
  {
    setting: 'Email rate limit',
    value: 'raised from the default of 30 an hour before any on-air call to sign in',
  },
  {
    setting: 'Leaked-password protection',
    value: 'on, once the engine organisation is on a paid plan',
  },
];

export function provisioningPlan(
  input: ProvisioningInput,
  allowlist: Allowlist,
): ProvisioningStep[] {
  for (const [label, value] of [
    ['project address', input.projectUrl],
    ['site address', input.siteUrl],
  ] as const) {
    if (!HTTPS_ORIGIN_RE.test(value))
      throw new Error(`The ${label} must be an https address with no path.`);
  }
  if (input.publishableKey.trim() === '') throw new Error('The publishable key is missing.');
  if (/secret|service_role/i.test(input.publishableKey)) {
    throw new Error(
      'That looks like a secret key. Only the publishable key may be stored in the database.',
    );
  }
  const entitlements = JSON.stringify(input.entitlements);

  return [
    {
      id: 'project',
      kind: 'founder',
      title: 'Create the project',
      detail:
        'In the engine organisation (never any other), in the region chosen for this tenant. The region cannot be changed later. Keep the project reference out of this repository.',
    },
    {
      id: 'schema',
      kind: 'tool',
      title: 'Apply the engine migrations',
      detail:
        'Run the fan-out tool for this one project. It refuses a project outside the engine organisation, applies every migration in its own transaction, then runs the catalogue check and the security check.',
    },
    {
      id: 'entitlements',
      kind: 'sql',
      title: 'Write what this world is allowed',
      detail:
        'The read-only copy of the entitlements. Written as the database owner; nobody inside the world can change it.',
      sql: `select engine.write_entitlements(${sqlLiteral(entitlements)}::jsonb);`,
    },
    {
      id: 'project-settings',
      kind: 'sql',
      title: 'Tell the scheduled jobs where this project is',
      detail:
        'The weekly digest job calls one of the project’s own edge functions. The address and the publishable key are stored per project; no job ever holds an address.',
      sql: [
        'insert into engine.project_settings (key, value) values',
        `  ('functions_url', ${sqlLiteral(`${input.projectUrl}/functions/v1`)}),`,
        `  ('functions_key', ${sqlLiteral(input.publishableKey)})`,
        'on conflict (key) do update set value = excluded.value, updated_at = now();',
      ].join('\n'),
    },
    {
      id: 'sign-in',
      kind: 'settings',
      title: 'Sign-in settings',
      detail: SIGN_IN_SETTINGS.map((entry) => `${entry.setting}: ${entry.value}`).join('; '),
    },
    {
      id: 'storage',
      kind: 'check',
      title: 'Storage buckets',
      detail: `Created by the migrations with their rules: ${allowlist.storageBuckets.engine.join(', ')}. Check they exist and are empty.`,
    },
    {
      id: 'jobs',
      kind: 'check',
      title: 'Scheduled jobs',
      detail: `Created by the migrations: ${[...allowlist.scheduledJobs.engine, ...Object.keys(allowlist.scheduledJobs.changed)].join(', ')}. Check each is active.`,
    },
    {
      id: 'secrets',
      kind: 'secret',
      title: 'Function secrets',
      detail: FUNCTION_SECRETS.map(
        (secret) => `${secret.name}: ${secret.what}${secret.when ? ` (${secret.when})` : ''}`,
      ).join(' '),
    },
    ...allowlist.edgeFunctions.changed.map(
      (name): ProvisioningStep => ({
        id: `function:${name}`,
        kind: 'blocked',
        title: `Edge function ${name}`,
        detail:
          'Not deployable to a tenant yet: it still writes its own sentences and its default sender. It must first read its text by key from the wording table (the rows with renderer "edge") and take its sender from the function secrets.',
      }),
    ),
    {
      id: 'configuration',
      kind: 'tool',
      title: 'Publish the first configuration',
      detail:
        'Through the world’s own server (step E7): it checks the document against the contract and the entitlements, then calls publish_engine_configuration with the document and the world’s wording. Revision 1.',
    },
    {
      id: 'first-staff',
      kind: 'sql',
      title: 'The first staff account',
      detail:
        'The tenant owner signs in once with their email code; the engine owner then makes that one account staff. Every later staff member is added from inside the world, by two staff members.',
      sql: "update public.profiles set role = 'admin' where id = (select id from auth.users where email = '<the owner''s address>');",
    },
    {
      id: 'prove',
      kind: 'check',
      title: 'Prove it',
      detail:
        'Run the rollback-only probes against the project (they keep nothing), the security advisor (0 errors, 0 new findings), and record the schema fingerprint.',
    },
    {
      id: 'site-address',
      kind: 'settings',
      title: 'Hosting',
      detail: `The world answers on ${input.siteUrl}. Its hosting project gets this project's address and publishable key, and its own map key and email key (ADR-001, decisions 4 and 6).`,
    },
  ];
}

export function describePlan(steps: readonly ProvisioningStep[]): string {
  return steps
    .map((step, index) => {
      const head = `${String(index + 1).padStart(2, ' ')}. [${step.kind}] ${step.title}`;
      return [
        head,
        `    ${step.detail}`,
        ...(step.sql ? step.sql.split('\n').map((line) => `      ${line}`) : []),
      ].join('\n');
    })
    .join('\n');
}
