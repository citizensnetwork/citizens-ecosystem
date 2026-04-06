"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  followeeId: string;
  isFollowing: boolean;
  isFriend?: boolean;
};

export default function FollowButton({
  followeeId,
  isFollowing: initialFollowing,
  isFriend = false,
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);

    const res = await fetch("/api/follow", {
      method: following ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followee_id: followeeId }),
    });

    if (res.ok) {
      setFollowing(!following);
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
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        following
          ? "border border-black/10 bg-white text-black hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          : "bg-(--gold) text-black hover:brightness-95"
      }`}
    >
      {loading
        ? "..."
        : following
          ? isFriend
            ? "Friends ✓"
            : "Following ✓"
          : "Follow"}
    </button>
  );
}
