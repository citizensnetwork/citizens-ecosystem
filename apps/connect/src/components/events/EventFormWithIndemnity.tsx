"use client";

import { useState } from "react";
import EventForm from "./EventForm";
import IndemnityForm from "@/components/auth/IndemnityForm";
import type { Category } from "@/types/db";

type Props = {
  isVendor: boolean;
  placeCategories: Category[];
};

export default function EventFormWithIndemnity({ isVendor, placeCategories }: Props) {
  const [indemnityCleared, setIndemnityCleared] = useState(false);

  if (!indemnityCleared) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Create Event</h1>
          <p className="text-sm text-black/50 mt-1">
            Please review and sign the required agreements before creating your event.
          </p>
        </div>
        <IndemnityForm
          appliesTo="events"
          onAllSigned={() => setIndemnityCleared(true)}
          onSkip={() => setIndemnityCleared(true)}
        />
      </div>
    );
  }

  return <EventForm isVendor={isVendor} placeCategories={placeCategories} />;
}
