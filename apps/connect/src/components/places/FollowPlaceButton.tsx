"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  placeId: string;
  isFollowing: boolean;
  followerCount: number;
};

export default function FollowPlaceButton({
  placeId,
  isFollowing: initialFollowing,
  followerCount: initialCount,
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    setErrorMessage(null);

    const res = await fetch("/api/place-follow", {
      method: following ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: placeId }),
    }).catch(() => null);

    if (res && res.ok) {
      setFollowing(!following);
      setCount((c) => (following ? c - 1 : c + 1));
      router.refresh();
    } else if (res && res.status === 401) {
      router.push("/login");
    } else {
      const data = await res?.json().catch(() => ({}));
      const fallback =
        res?.status === 429
          ? "Too many requests, please wait a moment."
          : "Couldn't update follow status. Please try again.";
      setErrorMessage(
        (typeof data?.error === "string" && data.error) || fallback,
      );
    }

    setLoading(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-pressed={following}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
          following
            ? "bg-black/5 text-black hover:bg-black/10"
            : "bg-(--gold) text-black hover:brightness-105"
        } disabled:opacity-50`}
      >
        {following ? "Following" : "Follow"}
        {count > 0 && (
          <span className="ml-1.5 text-xs font-normal opacity-70">
            {count}
          </span>
        )}
      </button>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
