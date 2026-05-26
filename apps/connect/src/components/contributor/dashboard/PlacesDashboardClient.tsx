"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PREDEFINED_SERVICES } from "@/types/db";

const MAX_SERVICES = 10;
const SERVICE_MAX_LEN = 40;
/** Mirror of server allowlist: letters, digits, space, period, underscore, hyphen. */
const SERVICE_ALLOWLIST = /^[A-Za-z0-9 ._-]*$/;

interface Place {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  status: string | null;
  created_at: string;
  place_follows: { count: number }[];
}

interface Service {
  id: string;
  service: string;
}

interface Props {
  slug: string;
  places: Place[];
}

export default function PlacesDashboardClient({ slug, places }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = places.find((p) => p.id === selectedId) ?? null;

  // Services state
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [newService, setNewService] = useState("");
  const [addingService, setAddingService] = useState(false);
  const [removingService, setRemovingService] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const fetchServices = useCallback(async (placeId: string) => {
    setServicesLoading(true);
    setServiceError(null);
    try {
      const res = await fetch(`/api/contributor/${slug}/places/${placeId}/services`);
      if (res.ok) {
        const data = await res.json();
        setServices(data.services ?? []);
      }
    } finally {
      setServicesLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (selectedId) {
      setServices([]);
      setNewService("");
      setServiceError(null);
      fetchServices(selectedId);
    }
  }, [selectedId, fetchServices]);

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !newService.trim() || addingService) return;
    setServiceError(null);
    setAddingService(true);
    try {
      const res = await fetch(`/api/contributor/${slug}/places/${selectedId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: newService.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServiceError(data.error ?? "Failed to add service");
      } else {
        setServices((prev) => [...prev, { id: data.id, service: data.service }]);
        setNewService("");
      }
    } finally {
      setAddingService(false);
    }
  }

  async function removeService(serviceId: string) {
    if (!selectedId) return;
    setRemovingService(serviceId);
    try {
      await fetch(
        `/api/contributor/${slug}/places/${selectedId}/services?id=${serviceId}`,
        { method: "DELETE" }
      );
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
    } finally {
      setRemovingService(null);
    }
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[400px]">
      {/* Left: list (60%) */}
      <div className="w-full lg:w-3/5 overflow-y-auto pr-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Your places ({places.length})</h2>
          <Link
            href="/places/new"
            className="text-sm px-3 py-1.5 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
          >
            + New place
          </Link>
        </div>

        {places.length === 0 ? (
          <div className="text-center py-16 text-[--foreground-soft]">
            <p className="text-sm">No places yet.</p>
            <Link
              href="/places/new"
              className="mt-3 inline-block text-sm text-[--gold] hover:underline"
            >
              Create your first place →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {places.map((place) => {
              const followers = place.place_follows?.[0]?.count ?? 0;
              return (
                <li key={place.id}>
                  <button
                    onClick={() => setSelectedId(place.id === selectedId ? null : place.id)}
                    className={[
                      "w-full text-left surface-card rounded-xl p-3 flex gap-3 items-start transition-colors",
                      place.id === selectedId
                        ? "border-[--gold] bg-[--gold-soft]"
                        : "hover:border-[--gold]/40",
                    ].join(" ")}
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-[--surface-muted] flex-shrink-0">
                      {place.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={place.image_url}
                          alt={place.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">
                          📍
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{place.name}</div>
                      {place.address && (
                        <div className="text-xs text-[--foreground-soft] truncate">{place.address}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {place.category && (
                          <span className="text-xs bg-[--surface-muted] px-2 py-0.5 rounded-full">
                            {place.category}
                          </span>
                        )}
                        <span className="text-xs text-[--foreground-soft]">
                          {followers} follower{followers !== 1 ? "s" : ""}
                        </span>
                        {place.status && place.status !== "published" && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full capitalize">
                            {place.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Right: preview + services panel (40%) — desktop only */}
      <aside className="hidden lg:flex w-2/5 flex-col surface-card rounded-2xl overflow-hidden">
        {selected ? (
          <>
            <div className="h-36 bg-[--surface-muted] overflow-hidden flex-shrink-0">
              {selected.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.image_url}
                  alt={selected.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">
                  📍
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{selected.name}</h3>
                {selected.address && (
                  <p className="text-sm text-[--foreground-soft] mt-0.5">{selected.address}</p>
                )}
                {selected.category && (
                  <p className="text-xs text-[--foreground-soft] mt-0.5">
                    {selected.category}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/places/${selected.id}`}
                  className="flex-1 text-center text-sm py-2 rounded-xl border border-[--border] hover:border-[--gold] transition-colors"
                >
                  View
                </Link>
                <Link
                  href={`/places/${selected.id}/edit`}
                  className="flex-1 text-center text-sm py-2 rounded-xl bg-[--gold] text-black font-semibold hover:opacity-90 transition-opacity"
                >
                  Edit
                </Link>
              </div>

              {/* Specialised services */}
              <section
                className="border-t border-[--border] pt-4"
                aria-label="Specialised services"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">
                    Specialised services{" "}
                    <span className="font-normal text-[--foreground-soft]">
                      ({services.length}/{MAX_SERVICES})
                    </span>
                  </h4>
                </div>
                <p className="text-xs text-[--foreground-soft] mb-3">
                  Help citizens discover this place. Shown publicly and included in search.
                </p>

                {servicesLoading ? (
                  <p className="text-xs text-[--foreground-soft]">Loading…</p>
                ) : (
                  <>
                    {/* Current chips */}
                    {services.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {services.map((svc) => (
                          <span
                            key={svc.id}
                            className="inline-flex items-center gap-1 text-xs bg-[--surface-muted] px-2.5 py-1 rounded-full border border-[--border]"
                          >
                            {svc.service}
                            <button
                              onClick={() => removeService(svc.id)}
                              disabled={removingService === svc.id}
                              className="opacity-50 hover:opacity-100 transition-opacity"
                              aria-label={`Remove ${svc.service}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add form */}
                    {services.length < MAX_SERVICES && (
                      <>
                        <form onSubmit={addService} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={newService}
                            onChange={(e) =>
                              setNewService(
                                e.target.value
                                  .replace(/[^A-Za-z0-9 ._-]/g, "")
                                  .slice(0, SERVICE_MAX_LEN)
                              )
                            }
                            placeholder="Add a service…"
                            maxLength={SERVICE_MAX_LEN}
                            className="flex-1 text-xs border border-[--border] rounded-xl px-3 py-1.5 bg-[--surface] focus:outline-none focus:border-[--gold]"
                          />
                          <button
                            type="submit"
                            disabled={
                              addingService ||
                              !newService.trim() ||
                              !SERVICE_ALLOWLIST.test(newService)
                            }
                            className="px-3 py-1.5 rounded-xl bg-[--gold] text-black text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                          >
                            Add
                          </button>
                        </form>
                        {serviceError && (
                          <p role="alert" className="text-xs text-red-500 mb-2">
                            {serviceError}
                          </p>
                        )}
                        {/* Predefined suggestions */}
                        <div className="flex flex-wrap gap-1">
                          {PREDEFINED_SERVICES.filter(
                            (s) =>
                              !services.some(
                                (svc) => svc.service.toLowerCase() === s.toLowerCase()
                              )
                          )
                            .slice(0, 8)
                            .map((svc) => (
                              <button
                                key={svc}
                                onClick={() => setNewService(svc)}
                                className="text-xs px-2 py-0.5 rounded-full border border-[--border] hover:border-[--gold] transition-colors"
                              >
                                {svc}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                    {services.length >= MAX_SERVICES && (
                      <p className="text-xs text-[--foreground-soft]">
                        Maximum {MAX_SERVICES} services reached.
                      </p>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[--foreground-soft]">

            Select a place to preview
          </div>
        )}
      </aside>
    </div>
  );
}
