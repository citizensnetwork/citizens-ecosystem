"use client";

import MediaStrip from "@/components/media/MediaStrip";
import type { EventMedia } from "@/types/db";

type Props = {
  media: EventMedia[];
};

export default function EventMediaStrip({ media }: Props) {
  return <MediaStrip media={media} ariaLabel="Event media gallery" />;
}