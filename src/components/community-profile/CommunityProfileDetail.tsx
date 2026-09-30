"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";
import { CommunityProfileView, type ProfileDTO } from "./CommunityProfileView";
import { CommunityProfileForm } from "./CommunityProfileForm";
import { ProfileEmptyState, ProfileLoading } from "./ProfileUi";

type Detail = { barangay: { id: string; name: string }; profile: ProfileDTO | null };

/** Loads one barangay's profile; the Officer can switch to the editor with ?edit=1. */
export function CommunityProfileDetail({ barangayId, showListLink = false }: { barangayId: string; showListLink?: boolean }) {
  const actor = useDashboardActor();
  const canEdit = hasCapability(actor.role, actor.permissions, "profiling.cycle.manage");
  const canReadImpact = hasCapability(actor.role, actor.permissions, "impact.read");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/community-profiles/${barangayId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(response.status === 403 ? "You do not have access to this barangay's community profile."
          : response.status === 404 ? "Barangay not found." : payload.error ?? "The community profile is temporarily unavailable.");
      }
      setDetail(payload.data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The community profile is temporarily unavailable.");
    } finally { setLoading(false); }
  }, [barangayId]);
  useEffect(() => { void load(); }, [load]);

  const finishEdit = () => { router.replace(pathname, { scroll: true }); void load(); };
  const editHref = `${pathname}?edit=1`;

  if (loading) return <ProfileLoading label="Loading community profile" />;
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>{error}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!detail) return null;
  if (search.get("edit") === "1" && canEdit) {
    return <CommunityProfileForm barangayId={barangayId} barangayName={detail.barangay.name} initial={detail.profile} onSaved={finishEdit} onCancel={finishEdit} />;
  }

  const backLink = showListLink && (
    <Link href="/officer/profiling" prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
      <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />All barangays
    </Link>
  );
  if (!detail.profile) {
    return (
      <div className="space-y-4">
        {backLink && <div className="flex justify-end">{backLink}</div>}
        <ProfileEmptyState
          title={`No community profile for ${detail.barangay.name} yet`}
          action={canEdit && (
            <Link href={editHref} prefetch={false} className={buttonVariants({ size: "sm" })}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Add profile
            </Link>
          )}
        >
          {canEdit
            ? "Add the counts from the barangay's community profiling report to see its profile here."
            : "PARAYA has not recorded a community profile for this barangay yet."}
        </ProfileEmptyState>
      </div>
    );
  }
  return (
    <CommunityProfileView
      barangayName={detail.barangay.name}
      profile={detail.profile}
      actions={(backLink || canEdit || canReadImpact) && <>
        {backLink}
        {canReadImpact && (
          <Link href={`/officer/impact/barangays/${barangayId}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Impact
          </Link>
        )}
        {canEdit && (
          <Link href={editHref} prefetch={false} className={buttonVariants({ size: "sm" })}>
            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Edit profile
          </Link>
        )}
      </>}
    />
  );
}
