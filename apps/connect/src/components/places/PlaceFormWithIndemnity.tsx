"use client";

import { useState } from "react";
import PlaceForm from "./PlaceForm";
import IndemnityForm from "@/components/auth/IndemnityForm";
import type { Category } from "@/types/db";

/**
 * Wraps PlaceForm with the Venue & Place Listing Agreement gate. Organiser
 * signs the required `venue-listing-waiver` before the place creation form
 * appears.
 */
export default function PlaceFormWithIndemnity({
  categories,
}: {
  categories: Category[];
}) {
  const [indemnityCleared, setIndemnityCleared] = useState(false);

  if (!indemnityCleared) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Add a Place</h1>
          <p className="text-sm text-black/50 mt-1">
            Please review and sign the listing agreement before adding a place.
          </p>
        </div>
        <IndemnityForm
          appliesTo="places"
          onAllSigned={() => setIndemnityCleared(true)}
          onSkip={() => setIndemnityCleared(true)}
        />
      </div>
    );
  }

  return <PlaceForm categories={categories} />;
}
