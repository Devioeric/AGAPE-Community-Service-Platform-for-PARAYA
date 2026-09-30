import type { AuthorizedActor } from "@/lib/auth/authorize";
import { PROFILE_KEY_FIGURES } from "./catalog";
import type { CommunityProfileData } from "./schema";
import { indicatorTotal, share } from "./stats";

export const PROFILE_COLUMNS = "id, barangay_id, schema_version, coverage, source_title, collected_on, respondent_households, individuals, notes, data, updated_at";

export type ProfileScope = { all: true } | { all: false; barangayId: string };

export function profileScope(actor: Pick<AuthorizedActor, "role" | "barangayId">): ProfileScope | null {
  if (actor.role === "paraya_officer") return { all: true };
  return actor.barangayId ? { all: false, barangayId: actor.barangayId } : null;
}

export function scopeAllows(scope: ProfileScope | null, barangayId: string): boolean {
  return scope !== null && (scope.all || scope.barangayId === barangayId);
}

export type KeyFigure = { key: string; label: string; percent: number | null; count: number | null; total: number | null };

export function keyFigures(data: CommunityProfileData): KeyFigure[] {
  return PROFILE_KEY_FIGURES.map((figure) => {
    const value = data[figure.indicator];
    const total = indicatorTotal(value);
    const count = value && total !== null ? figure.categories.reduce((sum, key) => sum + (value.counts[key] ?? 0), 0) : null;
    return { key: figure.key, label: figure.label, percent: share(value, figure.categories), count, total };
  });
}
