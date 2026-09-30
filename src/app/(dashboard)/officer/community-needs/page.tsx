import { CommunityNeedsManagement } from "@/components/community-needs/CommunityNeedsManagement";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { isNeedSuggestionsEnabled } from "@/lib/community-needs/feature";
import { Suspense } from "react";

// The flag is server-only; when it is off the suggestion panel is not mounted at all.
export default function CommunityNeedsPage() { return <Suspense fallback={<div className="space-y-5"><SectionTabs section="officer.community-needs" label="Community Needs sections" /><p role="status">Loading community needs…</p></div>}><CommunityNeedsManagement suggestionsEnabled={isNeedSuggestionsEnabled()} /></Suspense>; }
