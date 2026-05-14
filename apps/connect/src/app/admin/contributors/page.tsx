// /admin/contributors — legacy redirect.
//
// Per MASTER_DIRECTION FEAT-01 the canonical route is /admin/applications.
// Email deep-links generated before that rename still point here, so we
// keep the path alive and forward instead of breaking those links.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications — Admin · Citizens Connect" };

export default function AdminContributorsRedirect() {
  redirect("/admin/applications");
}
