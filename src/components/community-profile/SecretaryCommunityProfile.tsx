"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommunityProfileDetail } from "./CommunityProfileDetail";
import type { ProfileListRow } from "./CommunityProfileList";
import { ProfileEmptyState, ProfileLoading } from "./ProfileUi";

/** The Secretary's read-only view of their own barangay's community profile. */
export function SecretaryCommunityProfile() {
  const [row, setRow] = useState<ProfileListRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/community-profiles", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Community profile unavailable");
      setRow(payload.data?.[0] ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Community profile unavailable");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <ProfileLoading label="Loading community profile" />;
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!row) {
    return <ProfileEmptyState title="No barangay assignment">Your account is not assigned to a barangay. Ask the System Administrator to assign one.</ProfileEmptyState>;
  }
  if (!row.profile) {
    return (
      <ProfileEmptyState title={`No community profile for ${row.barangay.name} yet`}>
        PARAYA has not recorded a community profile for your barangay. It will appear here once PARAYA adds the counts from your barangay&apos;s profiling report.
      </ProfileEmptyState>
    );
  }
  return (
    <Suspense fallback={<ProfileLoading label="Loading community profile" />}>
      <CommunityProfileDetail barangayId={row.barangay.id} />
    </Suspense>
  );
}
