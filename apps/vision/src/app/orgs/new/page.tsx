import Link from "next/link";
import { CreateOrganisationForm } from "@/components/org/CreateOrganisationForm";

export const metadata = {
  title: "Create Organisation — Citizens Vision",
};

export default function NewOrganisationPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">
            Organisation Setup
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-text-primary">
            Create your organisation
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Start by creating an organisation space for your teams, projects, goals, and activity tracking.
          </p>
        </div>

        <CreateOrganisationForm />

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have access to an organisation?{" "}
          <Link href="/" className="text-accent hover:underline">
            Return to organisation selection
          </Link>
        </p>
      </div>
    </div>
  );
}