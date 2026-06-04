import PlaceDetailServer from "@/components/places/PlaceDetailServer";

export const dynamic = "force-dynamic";

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Full-page detail (Figma model). PlaceDetailServer fetches and calls
  // notFound() itself, then renders PlaceDetailContent — which provides its
  // own hero (with an in-hero back arrow) and card, so no page-header chrome
  // or outer wrapper is needed here.
  return <PlaceDetailServer id={id} />;
}
