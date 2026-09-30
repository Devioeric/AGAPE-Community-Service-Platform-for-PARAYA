import { Suspense } from "react";
import { CommunityProfileDetail } from "@/components/community-profile/CommunityProfileDetail";

export default async function BarangayProfilePage({ params }: { params: Promise<{ barangayId: string }> }) {
  const { barangayId } = await params;
  return <Suspense fallback={<p role="status">Loading community profile…</p>}><CommunityProfileDetail barangayId={barangayId} showListLink /></Suspense>;
}
