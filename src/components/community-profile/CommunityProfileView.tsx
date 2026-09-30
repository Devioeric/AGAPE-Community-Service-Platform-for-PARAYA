"use client";

import { useState, type ReactNode } from "react";
import { Building2, CalendarDays, Clock, FileText, Home, Info, Users, Wallet, Waves, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PROFILE_KEY_FIGURES, PROFILE_SECTIONS, type ProfileIndicator } from "@/lib/community-profile/catalog";
import type { CommunityProfileData, IndicatorValue } from "@/lib/community-profile/schema";
import { keyFigures } from "@/lib/community-profile/server";
import { formatPercent, indicatorRows, indicatorTotal } from "@/lib/community-profile/stats";
import { MultipleAnswersPill, ProfileRecordHeader, ProfileSectionTabs, ProfileStatCard, formatProfileDate } from "./ProfileUi";

export type ProfileDTO = {
  id: string;
  barangay_id: string;
  schema_version: string;
  coverage: string | null;
  source_title: string;
  collected_on: string | null;
  respondent_households: number | null;
  individuals: number | null;
  notes: string | null;
  data: CommunityProfileData;
  updated_at: string;
  data_valid?: boolean;
};

// One icon and accent per catalog key figure, in PROFILE_KEY_FIGURES order.
const FIGURE_STYLE: Record<string, { icon: typeof Wallet; accent: string }> = {
  low_income: { icon: Wallet, accent: "border-l-warning" },
  flood_prone: { icon: Waves, accent: "border-l-info" },
  insecure_tenure: { icon: Building2, accent: "border-l-danger" },
  no_internet: { icon: WifiOff, accent: "border-l-accent" },
};

function MetaItem({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm text-foreground">{value}</dd>
      </div>
    </div>
  );
}

function IndicatorCard({ indicator, value }: { indicator: ProfileIndicator; value: IndicatorValue | undefined }) {
  const total = indicatorTotal(value);
  const rows = indicatorRows(indicator, value);
  // The largest category gets the solid bar; rows keep the catalog order.
  const largest = rows.reduce((max, row) => Math.max(max, row.count ?? 0), 0);
  const caption = total === null ? null
    : indicator.response === "multiple" ? `${total} answers; households could choose more than one`
      : `${total} ${indicator.unit}`;
  return (
    <section className="mb-4 break-inside-avoid rounded-lg border border-border bg-background p-4">
      <header className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{indicator.label}</h3>
        {indicator.response === "multiple" && <MultipleAnswersPill />}
      </header>
      {total === null ? <p className="py-2 text-sm text-muted-foreground">Not reported in this profile.</p> : (
        <table className="w-full text-sm">
          <thead className="sr-only"><tr><th scope="col">Category</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const top = largest > 0 && row.count === largest;
              return (
                <tr key={row.key} className={row.count ? "text-foreground" : "text-muted-foreground"}>
                  <td className="py-1.5 pr-3 align-top">
                    <span className={top ? "font-medium" : undefined}>{row.label}</span>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${top ? "bg-primary" : "bg-primary/40"}`} style={{ width: `${Math.min(row.percent ?? 0, 100)}%` }} />
                    </div>
                  </td>
                  <td className="w-12 py-1.5 text-right align-top tabular-nums">{row.count ?? "—"}</td>
                  <td className="w-16 py-1.5 text-right align-top text-muted-foreground tabular-nums">{formatPercent(row.percent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {(caption || value?.note) && (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {caption && <p>{caption}</p>}
          {value?.note && <p className="flex gap-1.5"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{value.note}</p>}
        </div>
      )}
    </section>
  );
}

/** Read-only profile: record header, key figures, then one tab per report section. */
export function CommunityProfileView({ barangayName, profile, actions }: { barangayName: string; profile: ProfileDTO; actions?: ReactNode }) {
  const [section, setSection] = useState(PROFILE_SECTIONS[0].key);
  const data = profile.data ?? {};
  const figures = keyFigures(data);
  return (
    <div className="space-y-4">
      <ProfileRecordHeader name={barangayName} detail={profile.coverage ?? "Coverage not stated"} actions={actions}>
        <dl className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
          <MetaItem icon={FileText} label="Source" value={profile.source_title} />
          <MetaItem icon={CalendarDays} label="Collected" value={formatProfileDate(profile.collected_on) ?? "Not stated in the source"} />
          <MetaItem icon={Clock} label="Last updated" value={formatProfileDate(profile.updated_at) ?? "—"} />
        </dl>
        {profile.notes && (
          <div className="flex gap-2 rounded-lg bg-surface-alt/70 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p><span className="font-medium text-foreground">Data notes. </span>{profile.notes}</p>
          </div>
        )}
        {profile.data_valid === false && <p role="alert" className="text-sm text-warning">Some stored values could not be read. Open the editor and save the profile again.</p>}
      </ProfileRecordHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <ProfileStatCard icon={Home} label="Households surveyed" value={profile.respondent_households ?? "—"} sub="Respondent households" accent="border-l-primary" />
        <ProfileStatCard icon={Users} label="Individuals" value={profile.individuals ?? "—"} sub="Household members counted" accent="border-l-success" />
        {PROFILE_KEY_FIGURES.map((figure, index) => {
          const result = figures[index];
          const style = FIGURE_STYLE[figure.key] ?? { icon: Info, accent: "border-l-primary" };
          return (
            <ProfileStatCard
              key={figure.key}
              icon={style.icon}
              label={figure.label}
              value={formatPercent(result.percent)}
              sub={result.count === null ? "Not reported" : `${result.count} of ${result.total} households`}
              accent={style.accent}
            />
          );
        })}
      </div>

      <Card className="border-border shadow-card">
        <CardContent className="px-5 pb-1 pt-1">
          <ProfileSectionTabs value={section} onChange={setSection} badge={(item) => item.indicators.length}>
            {(item) => (
              <div className="columns-1 gap-4 lg:columns-2 xl:columns-3">
                {item.indicators.map((indicator) => <IndicatorCard key={indicator.key} indicator={indicator} value={data[indicator.key]} />)}
              </div>
            )}
          </ProfileSectionTabs>
        </CardContent>
      </Card>
    </div>
  );
}
