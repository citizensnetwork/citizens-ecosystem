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
  const router = useRouter();

  async function handleClick() {
    setLoading(true);

    const res = await fetch("/api/place-follow", {
      method: following ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_id: placeId }),
    });

    if (res.ok) {
      setFollowing(!following);
      setCount((c) => (following ? c - 1 : c + 1));
      router.refresh();
    } else if (res.status === 401) {
      router.push("/login");
    }

    setLoading(false);
  }

  return (
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
  );
}
