// Contributor-related view-model types shared by the API/lib layer.
//
// `PendingApplication` was previously exported from the (now-removed) admin
// `ContributorReviewCard` client component. It is the row→view-model shape for a
// pending contributor application (DB columns + the joined applicant email/name),
// consumed by `src/lib/contributors/pendingApplications.ts` and the admin API.
// Moved here during the frontend strip-out (API-only pivot) so the backend no
// longer depends on a deleted UI component.

export interface PendingApplication {
  id: string;
  user_id: string;
  display_name: string;
  contributor_kind: string | null;
  bio: string | null;
  website_url: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  tiktok_handle: string | null;
  youtube_url: string | null;
  physical_address: string | null;
  logo_url: string | null;
  motivation_text: string | null;
  submitted_at: string;
  applicant_email: string | null;
  applicant_name: string | null;
}
