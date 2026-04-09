"use client";

import { useState, useRef, useEffect } from "react";
import { geocodeSearch, type GeocodingResult } from "@/lib/map/utils";

interface MapSearchBarProps {
  onSelect: (lat: number, lng: number, name: string) => void;
}

export function MapSearchBar({ onSelect }: MapSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearch(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const data = await geocodeSearch(value);
      setResults(data);
      setShowDropdown(data.length > 0);
      setActiveIndex(-1);
      setLoading(false);
    }, 400);
  }

  function handleSelect(result: GeocodingResult) {
    onSelect(result.lat, result.lon, result.display_name);
    setQuery(result.display_name.split(",")[0]);
    setShowDropdown(false);
    setResults([]);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowDropdown(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search location..."
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 pl-8 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label="Search for a location"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls="map-search-results"
          aria-activedescendant={activeIndex >= 0 ? `map-search-option-${activeIndex}` : undefined}
          role="combobox"
          aria-autocomplete="list"
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary animate-pulse">
            …
          </span>
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <ul
          className="absolute z-30 mt-1 w-full rounded-md border border-border bg-surface shadow-lg"
          role="listbox"
          id="map-search-results"
        >
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lon}-${i}`}>
              <button
                type="button"
                id={`map-search-option-${i}`}
                onClick={() => handleSelect(r)}
                className={`w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-alt ${i === activeIndex ? "bg-surface-alt" : ""}`}
                role="option"
                aria-selected={i === activeIndex}
              >
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
