export type ProfilingCycleStatus = "draft" | "collecting" | "validating" | "completed" | "archived";
export type ProfilingSubmissionStatus = "draft" | "pending" | "approved" | "returned" | "superseded";
export type ProfilingImportStatus = "uploaded" | "validating" | "needs_correction" | "ready" | "committed" | "failed" | "purged";
export type ProfilingRuntimeMode = "off" | "synthetic" | "live";
export type ConsentStatus = "granted" | "refused" | "withdrawn";
export type HouseholdLifecycleStatus = "active" | "moved" | "dissolved" | "merged";
export type ResidentLifecycleStatus = "active" | "inactive" | "deceased" | "merged";

export type SuppressedCount =
  | { suppressed: false; value: number; label: string }
  | { suppressed: true; value: null; label: string };

export interface ProfilingAggregateDTO {
  schemaVersion: "agape.profiling.aggregate.v2";
  cycle: { id: string; name: string; status: ProfilingCycleStatus; reportingDate: string };
  sample: {
    method: string;
    targetHouseholds: number;
    registeredHouseholds: number;
    participatingHouseholds: number;
    nonparticipatingHouseholds: number;
    approvedHouseholds: number;
    approvedResidents: number;
    coveragePercent: number | null;
    responseRatePercent: number | null;
  };
  source: { kind: "approved_sample"; legacyExcluded: true; evidenceSnapshotId: string | null };
  official: { totalPopulation: number | null; totalHouseholds: number | null; sourceName: string | null; asOfDate: string | null; verified: boolean };
  asOf: string;
  privacy: { suppressionThreshold: number; complementarySuppression: true };
  dataQuality: {
    pendingPackages: number;
    returnedPackages: number;
    excludedPackages: number;
    unresolvedDuplicates: number;
  };
  cells: Array<{ dimension: string; key: string; count: SuppressedCount }>;
}
