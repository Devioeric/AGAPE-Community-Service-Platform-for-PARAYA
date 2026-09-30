"use client";

import { useEffect, useRef, useState } from "react";
import { PROFILE_TARGETS, profileTarget, targetValue } from "@/lib/community-profile/targets";
import type { CommunityProfileData } from "@/lib/community-profile/schema";

type Props = { barangayId: string | null; value: string; onChange(value: string): void; canReadProfile: boolean };

const groups = ["health", "livelihood", "education", "infrastructure", "environment"] as const;
const labels: Record<string, string> = { health: "Health", livelihood: "Livelihood", education: "Education", infrastructure: "Infrastructure", environment: "Environment" };

export function TargetFigureField({ barangayId, value, onChange, canReadProfile }: Props) {
  const [profileState, setProfileState] = useState<{ name: string; data: CommunityProfileData } | { name: string; data: null } | null>(null);
  const profileCache = useRef(new Map<string, { name: string; data: CommunityProfileData } | { name: string; data: null }>());

  useEffect(() => {
    let cancelled = false;
    setProfileState(null);
    if (!value || !barangayId || !canReadProfile) return () => { cancelled = true; };
    const cached = profileCache.current.get(barangayId);
    if (cached) {
      setProfileState(cached);
      return () => { cancelled = true; };
    }
    fetch(`/api/community-profiles/${barangayId}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("profile unavailable")))
      .then((payload) => {
        if (cancelled) return;
        const name = payload.data?.barangay?.name ?? "This barangay";
        const data = payload.data?.profile?.data;
        const next = { name, data: data && typeof data === "object" ? data as CommunityProfileData : null };
        profileCache.current.set(barangayId, next);
        setProfileState(next);
      })
      .catch(() => { if (!cancelled) { const next = { name: "This barangay", data: null }; profileCache.current.set(barangayId, next); setProfileState(next); } });
    return () => { cancelled = true; };
  }, [barangayId, canReadProfile, value]);

  const selected = profileTarget(value);
  const current = selected && profileState?.data ? targetValue(selected, profileState.data) : null;
  return (
    <div className="space-y-1.5">
      <label htmlFor="target-profile-figure" className="text-sm font-medium text-foreground">Community profile figure it aims to lower (optional)</label>
      <select id="target-profile-figure" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
        <option value="">None: not planned from the community profile</option>
        {groups.map((group) => (
          <optgroup key={group} label={labels[group]}>{PROFILE_TARGETS.filter((target) => target.needCategory === group).map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}</optgroup>
        ))}
        <optgroup label="Other">{PROFILE_TARGETS.filter((target) => target.needCategory === null).map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}</optgroup>
      </select>
      <p className="text-xs text-muted-foreground">Pick one only if the program was planned to lower a figure in the barangay&apos;s community profile.</p>
      {value && profileState && (current?.percent !== null && current?.percent !== undefined
        ? <p className="text-xs text-muted-foreground">Now {current.percent.toFixed(1)}% of {current.base} in {profileState.name}</p>
        : <p className="text-xs text-muted-foreground">{profileState.name} has no community profile yet.</p>)}
    </div>
  );
}
