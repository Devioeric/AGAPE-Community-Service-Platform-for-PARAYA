import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createProgramInvitationSchema,
  programLeaderSetSchema,
  programMatchingSetupSchema,
  volunteerPreferencesInputSchema,
} from "../../src/lib/volunteers/phase4-contracts.ts";

const migration = readFileSync(
  "supabase/migrations/20260818001010_phase4_volunteer_matching_invitations.sql",
  "utf8"
);
const leaderWorkspaceMigration = readFileSync(
  "supabase/migrations/20260818001020_phase4_leader_invitation_workspace.sql",
  "utf8"
);

test("volunteer preferences reject unknown fields, invalid windows, and unconsented location", () => {
  const valid = {
    expectedVersion: null,
    skills: ["data_collection"],
    availability: [{ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }],
    location: {
      consent: true,
      barangayId: null,
      sitioId: null,
      approximateLatitude: 14.85,
      approximateLongitude: 120.82,
    },
  };
  assert.equal(volunteerPreferencesInputSchema.safeParse(valid).success, true);
  assert.equal(volunteerPreferencesInputSchema.safeParse({ ...valid, residentName: "forbidden" }).success, false);
  assert.equal(volunteerPreferencesInputSchema.safeParse({
    ...valid,
    availability: [{ dayOfWeek: 1, startTime: "12:00", endTime: "08:00" }],
  }).success, false);
  assert.equal(volunteerPreferencesInputSchema.safeParse({
    ...valid,
    location: { ...valid.location, consent: false },
  }).success, false);
});

test("matching and invitation contracts are strict and bounded", () => {
  const setup = {
    expectedVersion: null,
    requiredSkills: ["first_aid"],
    allowedCourses: ["BS Nursing"],
    minimumYearLevel: 1,
    maximumYearLevel: 4,
    signupDeadline: "2026-09-01T08:00:00+08:00",
    site: {
      venueName: "Covered Court",
      barangayId: "00000000-0000-4000-8000-000000000001",
      sitioId: null,
      latitude: 14.85,
      longitude: 120.82,
      startsAt: "2026-09-02T08:00:00+08:00",
      endsAt: "2026-09-02T12:00:00+08:00",
      radiusKm: 5,
    },
  };
  assert.equal(programMatchingSetupSchema.safeParse(setup).success, true);
  assert.equal(programMatchingSetupSchema.safeParse({
    ...setup,
    site: { ...setup.site, endsAt: setup.site.startsAt },
  }).success, false);
  assert.equal(createProgramInvitationSchema.safeParse({
    label: "Nursing volunteers",
    expiresAt: "2026-09-01T08:00:00+08:00",
    maxUses: 4,
    allowedEmailDomain: "dyci.edu.ph",
    allowExternalEmail: false,
    externalExceptionReason: null,
  }).success, true);
  assert.equal(createProgramInvitationSchema.safeParse({
    expiresAt: "2026-09-01T08:00:00+08:00",
    maxUses: 1,
    allowedEmailDomain: "dyci.edu.ph",
    allowExternalEmail: true,
  }).success, false);
});

test("program leader selection rejects duplicates and oversized sets", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(programLeaderSetSchema.safeParse({ expectedVersion: 1, volunteerIds: [id] }).success, true);
  assert.equal(programLeaderSetSchema.safeParse({ expectedVersion: 1, volunteerIds: [id, id] }).success, false);
  assert.equal(programLeaderSetSchema.safeParse({
    expectedVersion: 1,
    volunteerIds: Array.from({ length: 11 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  }).success, false);
});

test("Phase 4 runtime and location privacy fail closed", () => {
  assert.match(migration, /VALUES \('volunteer_matching'\),\('program_invitations'\)/);
  assert.match(migration, /mode text NOT NULL DEFAULT 'off'/);
  assert.match(migration, /numeric\(5,2\)/);
  assert.match(migration, /numeric\(6,2\)/);
  assert.match(migration, /location data requires consent/);
  assert.match(migration, /CASE WHEN consent THEN round\(lat,2\) END/);
  assert.match(migration, /'withinRadius'.*'distanceBand'/s);
  const officerOutput = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.phase4_match_program_volunteers"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.phase4_assert_actor_runtime")
  );
  assert.doesNotMatch(officerOutput.slice(officerOutput.indexOf("jsonb_build_object")), /approximate_latitude|approximate_longitude|site_lat|site_lon/);
});

test("matching order is eligibility, skill, availability, then proximity", () => {
  assert.match(migration, /ORDER BY eligible DESC,skill_match DESC,\s*CASE availability_state[\s\S]*km NULLS LAST,id/);
  assert.match(migration, /6371\*acos/);
  assert.match(migration, /volunteer_class_schedules/);
});

test("secure invitations are hashed, bounded, revocable, and capacity-aware", () => {
  assert.match(migration, /token_hash text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /expires_at<=created_at\+interval '7 days'/);
  assert.match(migration, /p_max_uses>remaining/);
  assert.match(migration, /p_expires_at>r\.signup_deadline/);
  assert.match(migration, /Director exception required/);
  assert.match(migration, /phase4_revoke_program_invitation/);
  assert.match(migration, /RETURNING \* INTO i;[\s\S]*'exhausted'/);
});

test("program leaders and waitlist decisions are transactional and audited", () => {
  assert.match(migration, /phase4_set_program_leaders/);
  assert.match(migration, /leader must be an active assigned volunteer/);
  assert.match(migration, /phase4_list_program_waitlist/);
  assert.match(migration, /existing_waitlist[\s\S]*'idempotent',true/);
  assert.match(migration, /waitlist_approved.*waitlist_declined/s);
  assert.match(migration, /program\.waitlist\.'\|\|p_action/);
  assert.match(migration, /volunteer_invitation_events_immutable/);
});

test("sensitive Phase 4 functions have reviewed grants only", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase4_resolve_invitation\(text\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase4_resolve_invitation\(text\) TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase4_consume_invitation_for_user\(text,uuid,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase4_consume_invitation_for_user\(text,uuid,text\) TO service_role/);
  assert.match(migration, /ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY %I[\s\S]*USING\(false\) WITH CHECK\(false\)/);
});

test("volunteer-specific and token-specific GET responses cannot be statically cached", () => {
  for (const route of [
    "src/app/api/v2/volunteers/preferences/route.ts",
    "src/app/api/v2/volunteers/programs/route.ts",
    "src/app/api/v2/volunteers/leader-programs/route.ts",
    "src/app/api/v2/program-invitations/resolve/route.ts",
  ]) {
    assert.match(readFileSync(route, "utf8"), /export const dynamic = "force-dynamic"/);
  }
});

test("designated volunteer leaders receive only their scoped invitation workspace", () => {
  assert.match(leaderWorkspaceMigration, /phase4_assert_actor_runtime\('program_invitations'\)/);
  assert.match(leaderWorkspaceMigration, /phase2_current_has_capability\('volunteer\.self'\)/);
  assert.match(leaderWorkspaceMigration, /leader\.volunteer_id=auth\.uid\(\)/);
  assert.match(leaderWorkspaceMigration, /p\.phase2_data_mode=runtime\.mode/);
  assert.match(leaderWorkspaceMigration, /p\.id=ANY\(runtime\.synthetic_program_ids\)/);
  assert.match(leaderWorkspaceMigration, /REVOKE ALL ON FUNCTION public\.phase4_list_my_leader_programs\(\) FROM PUBLIC,anon/);
  assert.doesNotMatch(leaderWorkspaceMigration, /token_hash|approximate_latitude|approximate_longitude/);
});
