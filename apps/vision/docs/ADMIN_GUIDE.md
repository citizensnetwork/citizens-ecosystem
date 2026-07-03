# Citizens Vision — Admin Guide

## Deployment

### Prerequisites

- Node.js 22.x
- npm 10+
- Supabase project (PostgreSQL 17)
- Vercel account

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Service role key for Edge Functions |

### Build & Deploy

```bash
# Install dependencies
npm install

# Run migrations (via Supabase CLI)
supabase db push

# Build
npm run build

# Deploy to Vercel
vercel --prod
```

### Vercel Configuration

1. Link project: `vercel link`
2. Set environment variables: `vercel env add NEXT_PUBLIC_SUPABASE_URL`
3. Deploy: `vercel --prod`

---

## Database Administration

### Migration Files

Migrations are located in `supabase/migrations/` and numbered sequentially:

| # | File | Phase | Content |
|---|------|-------|---------|
| 001 | `001_foundation.sql` | 0 | Organisations, departments, user_org_roles, RLS helpers |
| 002 | `002_activities.sql` | 1 | Activities, activity_tags |
| 003 | `003_metrics.sql` | 3 | Metric definitions, materialized views |
| 004 | `004_goals_alignment.sql` | 4 | Vision, goals, alignment links |
| 005 | `005_goals_security_fixes.sql` | 4 | Goal security policy fixes |
| 006 | `006_projects.sql` | 5 | Projects, milestones, project links |
| 007 | `007_fix_org_select_policy.sql` | 5 | Organisation select policy fix |
| 008 | `008_cc_sync.sql` | 7 | CC mirror tables, sync log |
| 009 | `009_advisory.sql` | 8 | Advisory templates, rules, outputs |
| 010 | `010_boundaries.sql` | 9 | Geo-boundaries, coverage views |
| 011 | `011_analytics_export.sql` | 10 | Export logs, scheduled reports, regression |
| 012 | `012_federation.sql` | 11 | Org partnerships, shared metrics |

### RLS Helper Functions

These SECURITY DEFINER functions are used in all RLS policies:

- `is_org_member(org_id UUID)` — Returns true if current user is a member of the org
- `is_org_admin(org_id UUID)` — Returns true if current user is admin of the org
- `get_user_org_role(org_id UUID)` — Returns the user's role in the org
- `is_platform_admin()` — Returns true if current user is a platform admin

### Materialized Views

These refresh hourly via the `refresh-materialized-views` Edge Function:

| View | Purpose |
|------|---------|
| `mv_org_activity_summary` | Per-org activity volume KPIs |
| `mv_department_ranking` | Department comparison metrics |
| `mv_goal_alignment_matrix` | Goal alignment scores |
| `mv_boundary_activity_coverage` | Geo coverage analysis |
| `mv_temporal_activity_heatmap` | Timeline density data |

### Manual Materialized View Refresh

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_activity_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_department_ranking;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_goal_alignment_matrix;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_boundary_activity_coverage;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_temporal_activity_heatmap;
```

---

## Edge Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `sync-from-connect` | Every 15 min | Pull data from Citizens Connect |
| `generate-advisory` | Daily | Evaluate rules and generate advisories |

### Deploying Edge Functions

```bash
supabase functions deploy sync-from-connect
supabase functions deploy generate-advisory
```

---

## User Management

### Creating Platform Admins

Platform admins have access across all organisations. Set via SQL:

```sql
UPDATE user_org_roles
SET role = 'platform_admin'
WHERE user_id = '<user-uuid>'
AND org_id = '<any-org-uuid>';
```

### Org Admin Actions

Org admins can:
- Invite/remove members
- Change member roles
- Manage departments
- Configure advisory rules
- Manage partnerships and data sharing
- Create scheduled reports

---

## Multi-Org Federation

### Partnership Setup

1. Org A admin creates a partnership request to Org B
2. Org B admin accepts/rejects the request
3. Once active, configure sharing level:
   - **summary**: Anonymized aggregate metrics only
   - **detailed**: Named metrics visible to partners
   - **full**: Complete data sharing
4. Configure which metrics are shared via the Shared Metrics panel

### Data Sharing Policies

- All sharing is opt-in — no data visible by default
- RLS policies enforce sharing boundaries at the database level
- Community (anonymized) view requires explicit opt-in per org

---

## Monitoring & Maintenance

### Health Checks

- **Application**: Check Vercel deployment status
- **Database**: Monitor via Supabase Dashboard → Database → Health
- **Edge Functions**: Check Supabase Dashboard → Edge Functions → Logs

### Backup Strategy

Supabase provides automatic daily backups. For additional safety:

```bash
# Export schema
supabase db dump --schema public > backup.sql

# Export data (service role required)
supabase db dump --data-only > data_backup.sql
```

### Performance Monitoring

- Vercel Analytics: Automatic web vitals tracking
- Supabase Dashboard: Query performance, connection pooling stats
- Lighthouse Audits: Run periodically for performance regression

---

## Security Checklist

- [ ] All tables have RLS enabled
- [ ] No service role key in client-side code
- [ ] PKCE auth flow (no implicit tokens)
- [ ] UUIDs validated before database queries
- [ ] Security headers configured (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- [ ] `poweredByHeader: false` in Next.js config
- [ ] No SQL injection vectors (Supabase parameterized builder only)
- [ ] Multi-tenant isolation verified via test suite

---

## Capacitor (Mobile) Setup

Citizens Vision supports mobile deployment via Capacitor:

```bash
# Install Capacitor
npm install @capacitor/core @capacitor/cli

# Initialize platforms
npx cap add android
npx cap add ios

# Build and sync
npm run build
npx cap sync

# Open native IDE
npx cap open android  # Android Studio
npx cap open ios      # Xcode
```

Configuration is in `capacitor.config.ts` at the project root.

---

## Testing

### Unit Tests (Vitest)

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### E2E Tests (Playwright)

```bash
npm run test:e2e         # Headless
npm run test:e2e:headed  # With browser UI
```

E2E tests require a running dev server. Set `E2E_TEST_ORG_SLUG` environment variable for authenticated test scenarios.

### Type Checking

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
```
