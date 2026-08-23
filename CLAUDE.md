# AGAPE - A System for Community Needs Assessment and Engagement Program

## Project Overview

AGAPE is a web-based platform for the PARAYA Office of Dr. Yanga's Colleges, Inc. (DYCI) in Bocaue, Bulacan. It replaces paper-based community extension workflows with a centralized digital system covering community needs assessment, volunteer coordination, barangay partnerships, program monitoring, donation management, analytics, and AI-assisted reporting.

PARAYA stands for **PA**mayanan (community development), paa**RA**lan (academic partnership), and parok**YA** (parish partnership).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| UI | React 18, Tailwind CSS 3, shadcn/ui (Base UI v4 — no `asChild` on triggers) |
| Forms | React Hook Form + Zod validation |
| Tables | TanStack Table v8 |
| Charts | Recharts 2 |
| Maps | React-Leaflet 4 + Leaflet (CartoDB Positron tiles) |
| Icons | Lucide React |
| Date picker | react-day-picker v10 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password, JWT sessions) |
| Storage | Supabase Storage (3 buckets: avatars, activity-photos, reports) |
| Authorization | Row Level Security (RLS) policies per role |
| AI | Local API Generator (OpenAI-compat, default) → Gemini fallback (narrative reports + chatbot) |
| Hosting | Vercel (frontend), Supabase (backend) |
| Runtime | Node.js 20 LTS |

---

## Design System & Color Theme

The design is based on the PARAYA logo — an earthy, warm brown palette symbolizing grounded community service.

### Color Palette (Tailwind custom config)

```
Primary:        #6B5B3E
Primary Light:  #8B7A5E
Primary Dark:   #4A3F2B
Accent:         #C4A96A
Accent Light:   #E8D5A8
Background:     #FAFAF7
Surface:        #FFFFFF
Surface Alt:    #F5F0E8
Border:         #E5DDD0
Text Primary:   #2C2416
Text Secondary: #6B6356
Text Muted:     #9C9488
Success:        #4A7C59
Warning:        #B8860B
Danger:         #9B3B3B
Info:           #5B7FA5
```

### Design Principles

- Modern, clean, minimal — generous whitespace
- Typography: `DM Sans` body, `Playfair Display` headings (Google Fonts)
- Rounded corners: `rounded-xl` cards, `rounded-lg` buttons/inputs
- Soft warm-tinted shadows
- Sub-second page transitions (`animate-page-in` is now **0.15s** — see Performance Notes)
- Custom thin scrollbar utility: `.scrollbar-thin` (transparent at rest, soft brown on hover)
- SDG colors: SDG 4 `#C5192D`, SDG 9 `#FD6925`, SDG 11 `#FD9D24`, SDG 17 `#19486A`

---

## Architecture

Three-tier:

1. **Presentation Tier** — Next.js App Router pages, React components, Tailwind/shadcn
2. **Application Tier** — Next.js Route Handlers, Supabase Auth, RLS policies
3. **Data Tier** — Supabase PostgreSQL, Supabase Storage, audit logs

### Auth/Profile Optimization (important)

To avoid double-fetching the user profile on every navigation, **middleware queries `users.role/full_name/permissions` once** and forwards them to server components via request headers (`x-user-role`, `x-user-email`, `x-user-name`, `x-user-permissions`). The dashboard layout reads these via `next/headers` instead of re-running `auth.getUser()` + the `users` query. This cut navigation latency roughly in half. See [src/middleware.ts](src/middleware.ts) and [src/app/(dashboard)/layout.tsx](src/app/(dashboard)/layout.tsx).

---

## User Roles & Sidebar

The system has **11 roles** (8 from R-1 + finance_officer + 3 new partner accounts from R-6). PARAYA staff are split into three by responsibility, barangay roles into three, and three partner account types submit proposals + co-manage programs. Two legacy values (`paraya_officer`, `barangay_official`) remain valid and behave as aliases during the transition — admins re-assign legacy users via the Admin → Users page as needed.

| Role | Route segment | Responsibilities (per scope) |
|---|---|---|
| **PARAYA Director** (`paraya_director`) | `/officer` | Program management, partnerships, endorsements/approvals, reporting |
| **PARAYA Associate** (`paraya_associate`) | `/officer` | Coordination & implementation, donations |
| **PARAYA Researcher** (`paraya_researcher`) | `/officer` | Data collection, community needs, program evaluation |
| **Finance Officer** (`finance_officer`) | `/officer` | Independent finance clearance on income-generating proposals |
| **Student Volunteer** (`volunteer`) | `/volunteer` | Programs, schedule, surveys, log hours, attendance |
| **Barangay Captain** (`barangay_captain`) | `/barangay` | **Approves community needs** before they reach PARAYA |
| **Barangay Secretary** (`barangay_secretary`) | `/barangay` | Barangay profile, submit community needs |
| **Mother Leader** (`barangay_mother_leader`) | `/barangay` | Sitio-level needs + household profiling support |
| **Office** (`office`) | `/partner` | Submit proposals; manage their programs (validated by PARAYA) |
| **Student Organization** (`student_org`) | `/partner` | Submit proposals; manage their programs (validated by PARAYA) |
| **Department** (`department`) | `/partner` | Submit proposals; see dept-matched volunteers; manage programs |
| **System Administrator** (`admin`) | `/admin` | Users (CRUD + invite + password reset), Audit Logs, Backup |

Centralized in [src/lib/auth/roles.ts](src/lib/auth/roles.ts): `Role` type, group constants (`PARAYA_ROLES`, `BARANGAY_ROLES`, `PARTNER_ROLES`, `STAFF_ROLES`, `MODERATOR_ROLES`, `PROPOSAL_SUBMITTER_ROLES`), predicates (`isParayaStaff`, `isPartner`, `isStaffOrAdmin`, `isModerator`, `isAdmin`, `canSubmitProposal`), `ROLE_LABELS`, `ROLE_HOME`, `ROLE_SEGMENT`, and `ASSIGNABLE_ROLES` (used by invite/edit dropdowns; admin excluded).

The Sidebar accepts both the route `segment` and the actual `dbRole`, with optional per-item `roles?: string[]` allowlist for role-specific nav (used for Captain-only "Approvals").

### Partner Accounts & Program-Item Validation (R-6)

Partner accounts (Office, Student Organization, Department) live under a single `/partner` segment but are distinct DB roles so the system can label and report them separately. They can:
- **Submit proposals** via the same `/api/proposals` POST as PARAYA staff — gated by `canSubmitProposal()`. Submissions enter the normal pipeline (pre-screening → SDG → finance → approved).
- **See programs** born from proposals they submitted. `/api/programs` GET filters via `programs.proposal_id IN (proposals WHERE created_by = me)`; `/api/programs/[id]` GET allows the proposal owner in addition to staff.
- **Add activities, budget items, and volunteer assignments** to their programs. Each insertion gets `approval_status='pending'` (staff insertions default to `'approved'`). Pending items stay visible to the partner with a "Pending review" badge but don't count toward program totals until validated.
- **See volunteers** in their scope via `/api/partner/volunteers`: Department accounts match `volunteers.department ilike users.org_name`; Office/Student Org accounts see volunteers signed up to their programs.

Volunteer-by-email resolution uses `/api/users/lookup?email=...` (gated to staff + partners; returns `volunteer`-role accounts only) so partners don't need to know UUIDs.

**Validation workflow:** PARAYA officers see the unified queue at `/officer/validations` (powered by `/api/validations`). Approve flips `approval_status='approved'` (and on signups, `status='confirmed'`); Reject sets `'rejected'` (and on signups, `status='withdrawn'`) plus a free-text note that goes to the submitter via notification. Mirrors the R-2 Captain approval pattern.

### Finance Officer Workflow

The Finance Officer (`finance_officer`) is the independent budget gatekeeper. They sit in the `/officer` segment alongside PARAYA staff but the Sidebar serves them a stripped-down `financeNav` (Dashboard, Finance Clearance, Proposals read-only) so they aren't distracted by program/volunteer ops they don't act on.

- **Dedicated page:** [src/app/(dashboard)/officer/finance/page.tsx](src/app/(dashboard)/officer/finance/page.tsx) — queue of proposals in `status='finance_review'` AND `finance_clearance=false`, plus a "Recently cleared" table. Inline Clear/Send-back actions; details dialog shows full rationale, SDG, budget, timeline.
- **Backing API:** [src/app/api/proposals/finance-queue/route.ts](src/app/api/proposals/finance-queue/route.ts) — gated by `canClearFinance()`; returns the minimal field set for the queue.
- **Clearance is recorded via the existing pipeline:** `/api/proposals/[id]/advance` with `action: 'mark_finance_cleared'` (Finance Officers are explicitly scoped to this action only — they can't advance/reject/request-revisions). The send-back flow uses the existing `request_revisions` action with required notes.
- **Account creation:** create via Admin → Users with role "Finance Officer" (group `finance` in `ASSIGNABLE_ROLES`).

### Volunteer Surveys

Volunteers can fill in published surveys on behalf of beneficiaries they're interviewing in the field. Same `/api/surveys` endpoint (which already returns `status='published'` rows to non-officers). New page at [src/app/(dashboard)/volunteer/surveys/page.tsx](src/app/(dashboard)/volunteer/surveys/page.tsx). UI copy frames the volunteer as the interviewer ("Start Interview", "Submit Another Response") — each response is a separate `survey_responses` row, so the same survey can be submitted once per beneficiary.

### Analytics Sub-Navigation (Officer)

Officer Analytics is a sidebar group with 5 children:
- Overview — [analytics/page.tsx](src/app/(dashboard)/officer/analytics/page.tsx)
- SDG Impact — [analytics/sdg](src/app/(dashboard)/officer/analytics/sdg/page.tsx)
- Volunteers — [analytics/volunteers](src/app/(dashboard)/officer/analytics/volunteers/page.tsx)
- Community Needs — [analytics/community-needs](src/app/(dashboard)/officer/analytics/community-needs/page.tsx)
- Proposal Pipeline — [analytics/proposals](src/app/(dashboard)/officer/analytics/proposals/page.tsx)
- Survey Analysis — lives at `/officer/surveys/analysis` but is shown under Analytics in the sidebar. The regular-nav active-state logic yields to a more specific sub-nav child, so the flat "Surveys" link doesn't double-highlight.

All five sub-pages use a single API call: `/api/analytics?type=<slug>` returns base aggregates **plus** type-specific extras (`programStats`, `topVolunteers`, `recentNeeds`, `surveysCompletedCount`, `proposalRows`). See [src/app/api/analytics/route.ts](src/app/api/analytics/route.ts).

---

## Database Schema

### Tables in Schema (running list)

- **Users & Auth:** `users` (extends `auth.users`), `roles`
- **Partnerships:** `barangays`, `partnership_history`
- **Proposals:** `project_proposals`, `proposal_reviews`, `proposal_sdg_alignment`
- **Community Needs:** `community_needs`, `surveys`, `survey_questions`, `survey_responses`, `survey_answers`, `survey_templates`
- **Volunteers:** `volunteers`, `program_signups`, `activity_logs`, **`volunteer_class_schedules`** *(new)*
- **Programs:** `programs`, `program_activities`, `program_budgets`, `program_attendance`
- **Donations:** `donations`, `donation_distributions`
- **Analytics:** `analytics_snapshots`, `ai_reports`
- **Impact:** `impact_indicators`, `impact_qualitative`, `follow_up_records`
- **System:** `audit_logs`, `notifications`

### Migrations to Run (in Supabase SQL Editor)

Located in [supabase/migrations/](supabase/migrations/):

1. `barangays_extra_columns.sql` — adds `contact_person`, `contact_phone`, `contact_email`, `total_population`, `total_households`, `partnership_start`, `latitude`, `longitude`, `is_active`, `updated_at`. **Required** for Partnerships UI.
2. `barangay_coordinates.sql` — seeds lat/lng so partner barangays render on the map.
3. `survey_templates.sql` — shared survey-template table.
4. `survey_builder_v2.sql` — sections + conditional questions.
5. `user_permissions.sql` — adds `permissions` JSONB column to `users` for per-module access toggles.
6. `ai_reports.sql` — `ai_reports` table for narrative-report generation.
7. `volunteer_class_schedules.sql` — recurring weekly class blocks per volunteer. RLS scopes every row to `auth.uid() = volunteer_id`.
8. `partnership_history.sql` — append-only timeline of partnership events per barangay; idempotent ALTER pattern to handle pre-existing tables.
9. `skills_and_assets.sql` — `barangay_skills` + `barangay_assets` (anonymized capacity tracking).
10. `household_profiles.sql` — household-level community profiling.
11. `proposal_gatekeeping.sql` — `is_income_generating`, `finance_clearance`, `finance_cleared_at/by/notes`, `prescreening_passed/checks/ran_at`.
12. `audit_logs_columns.sql` — defensive ALTER pattern ensuring audit_logs has full column set.
13. `forum.sql` — `forum_threads` + `forum_posts`.
14. `user_notification_prefs.sql` — `phone` + `notification_prefs` JSONB on `users`.
15. **`role_expansion.sql`** *(R-1)* — drops + re-adds `users_role_check` to accept all 8 new roles + 2 legacy aliases.
16. **`community_needs_approval.sql`** *(R-2)* — `approval_status` (default `approved` for backward compat), `approved_by`, `approved_at`, `approval_notes`.
17. **`attendance.sql`** *(R-3)* — `attendance` table (UNIQUE(activity_id, volunteer_id)) + `attendance_otp`/`attendance_otp_issued_at`/`attendance_otp_expires_at`/`attendance_otp_issued_by` on `program_activities`.
18. **`sitio_columns.sql`** *(R-4)* — `sitio TEXT` on `household_profiles` and `community_needs` + `(barangay_id, sitio)` composite indexes.
19. **`partner_roles_expansion.sql`** *(R-6)* — drops + re-adds `users_role_check` to accept `office`, `student_org`, `department` in addition to the prior roles; adds `users.org_name TEXT` so partner accounts can carry their entity name (e.g. "CICS", "CSG", "OSAS").
20. **`program_item_approvals.sql`** *(R-6)* — adds `approval_status` (`pending|approved|rejected`, default `approved` for back-compat), `approved_by`, `approved_at`, `approval_notes` to `program_activities`, `program_budgets`, and `program_signups`. Also adds `created_by` to `program_budgets` and `added_by` to `program_signups` so the validation queue can attribute submissions.

---

## API Routes (current state)

Located at [src/app/api/](src/app/api). All routes verify auth + role before responding.

```
/api/
  analytics/                  GET — global aggregates; ?type=sdg|volunteers|community-needs|proposals adds type-specific extras
  surveys/                    GET POST — non-officers see only status=published
  surveys/[id]/               GET PATCH DELETE
  surveys/[id]/respond/       POST — any authenticated user can submit
  surveys/analytics/          GET
  survey-templates/           GET POST
  survey-templates/[id]/      GET PATCH DELETE
  programs/                   GET POST — returns my_signup + signup_count per program
  programs/[id]/              GET PATCH DELETE
  programs/[id]/signup/       POST DELETE
  programs/[id]/activities/   GET POST
  programs/[id]/budget/       GET POST PATCH
  proposals/                  GET POST — POST gated by canSubmitProposal() (PARAYA staff + partner accounts); GET scoped to own for partners
  proposals/[id]/             GET PATCH DELETE
  proposals/[id]/advance/     POST — advances proposal through pipeline stages
  proposals/finance-queue/    GET — Finance Officer queue: pending + recent clearances
  volunteers/                 GET
  community-needs/            GET POST — non-officers see only their own submissions
  partnerships/               GET POST — POST uses createAdminClient() to bypass RLS
  partnerships/[id]/          GET PATCH DELETE — also via admin client
  donations/                  GET POST
  donations/[id]/             GET PATCH DELETE
  donations/[id]/distribute/  POST
  impact/                     GET POST
  impact/[id]/                PATCH DELETE
  impact/qualitative/         GET POST
  impact/qualitative/[id]/    PATCH DELETE
  impact/followup/            GET POST
  impact/followup/[id]/       PATCH DELETE
  activity-logs/              GET POST
  activity-logs/[id]/         PATCH DELETE
  notifications/              GET PATCH
  ai/narrative-report/        POST — Local AI gateway (default) → Gemini fallback
  ai/chatbot/                 POST — Local AI gateway (default) → Gemini fallback
  ai/reports/                 GET POST
  ai/reports/[id]/            GET PATCH DELETE
  users/                      GET — admin only
  users/[id]/                 PATCH — accepts full_name, role, status, barangay_id, permissions
  users/[id]/password/        POST — admin only; verifies admin's password via throwaway non-persisting client, then sets a new password OR sends recovery email
  admin/invite/               POST — sends invite email via admin API
  admin/stats/                GET
  admin/audit-logs/           GET — filter by level + search across user/action/resource
  admin/backup-info/          GET — Supabase-managed backup notice + per-table row counts
  auth/signup/                POST
  profile/                    GET PATCH — accepts full_name, phone, notification_prefs
  volunteer/dashboard/        GET — KPIs, announcements (from notifications), recent activity_logs
  volunteer/classes/          GET POST
  volunteer/classes/[id]/     PATCH DELETE
  household-profiles/         GET POST       — community profiling (officer + barangay reads)
  household-profiles/[id]/    PATCH DELETE
  skills/                     GET POST       — barangay_skills
  skills/[id]/                PATCH DELETE
  assets/                     GET POST       — barangay_assets
  assets/[id]/                PATCH DELETE
  forum/threads/              GET POST
  forum/threads/[id]/         GET PATCH DELETE
  forum/threads/[id]/posts/   POST
  forum/posts/[id]/           DELETE
  my-barangay/                GET — volunteer/barangay self-view
  barangay/reports/           GET — read-only barangay-scoped report data
  community-needs/[id]/approve/    POST — Captain approval (R-2)
  community-needs/[id]/reject/     POST — Captain rejection or revision request (R-2)
  programs/[id]/activities/[actId]/rotate-token/  POST — officer rotates attendance OTP (R-3)
  programs/[id]/activities/[actId]/attendance/    GET POST — roster + manual entry (R-3)
  attendance/check-in/        POST — volunteer enters OTP from QR/manual (R-3)
  officer/attendance/         GET — activities + OTP status for the attendance UI (R-3)
```

---

## Page-Specific Implementation Notes

### Volunteer Dashboard

[src/app/(dashboard)/volunteer/page.tsx](src/app/(dashboard)/volunteer/page.tsx) — fully DB-backed via `/api/volunteer/dashboard`:
- **Total Hours**: sum of approved `activity_logs.hours` since semester start (Aug 1 or Jan 1 split)
- **Activities Joined**: count of non-withdrawn `program_signups`
- **Upcoming Events**: signups whose program `start_date` is in the next 7 days
- **Announcements**: latest 5 `notifications` for this user (badge color from `type`)
- **Recent Activity Log**: latest 5 `activity_logs` joined with `programs(title)`

### Volunteer Schedule (calendar + class entry)

[src/app/(dashboard)/volunteer/schedule/page.tsx](src/app/(dashboard)/volunteer/schedule/page.tsx) — three sections:
1. **Month calendar** with prev/next/Today navigation. Each cell shows program events (by `start_date`) and recurring class blocks (matching `day_of_week`). Up to 3 events per cell, then "+N more".
2. **My Class Schedule** — editable list backed by `volunteer_class_schedules`. Day + start/end time + subject + optional location/notes. Add/edit dialog validates `end > start`.
3. **Program Assignments** — compacted Active/Upcoming list.

### Admin User Management

[src/app/(dashboard)/admin/users/page.tsx](src/app/(dashboard)/admin/users/page.tsx):
- **Edit User** dialog includes Full Name (mirrored to `auth.user_metadata`), plus role/barangay/status/per-module permissions.
- **Reset Password** dialog (new) — two modes:
  - Send Reset Email (`auth.resetPasswordForEmail`)
  - Set New Password directly (`auth.admin.updateUserById` via service role)
  - Both require the admin to re-enter their own password. Verified server-side via a throwaway non-persisting Supabase client — the admin's real session is never touched.

### Officer Survey Analysis

[src/app/(dashboard)/officer/surveys/analysis/page.tsx](src/app/(dashboard)/officer/surveys/analysis/page.tsx):
- Sticky table header (`sticky top-16 z-20 bg-muted/95 backdrop-blur-sm`). The shadcn `Card` was replaced with a plain styled div because `Card`'s built-in `overflow-hidden` clips sticky positioning.
- Three filters: search (title/barangay), status dropdown, barangay dropdown, plus a "Clear filters" link.

### Maps

Both [BarangayMap.tsx](src/components/maps/BarangayMap.tsx) and [ProgramMap.tsx](src/components/maps/ProgramMap.tsx) use **CartoDB Positron** tiles for a clean light minimal style with the brown/gold PARAYA palette. Bocaue PSGC boundaries live in [src/lib/bocaue-boundaries.ts](src/lib/bocaue-boundaries.ts) as a bundled TypeScript module (no `public/` fetch issues). Boundaries are **filtered to partner barangays only**, matched via a name-normalization helper that strips diacritics (ñ → n) and non-alphanumerics.

### Accept-Invite Page

[src/app/accept-invite/page.tsx](src/app/accept-invite/page.tsx) parses the URL hash for `error_code=otp_expired` (and other Supabase auth errors) and renders a proper "Invitation Expired" screen with a "Back to Login" CTA. A 10-second timeout fallback ensures the page can never get stuck on the loading spinner.

---

## Key Technical Patterns

### API route skeleton

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // role check, then query
}
```

### Admin client for RLS-blocked writes

For routes that already verify role in JS, use `createAdminClient()` (service role) for INSERT/UPDATE/DELETE to bypass RLS. Currently used by `/api/partnerships`, `/api/analytics`, `/api/users/[id]`, `/api/users/[id]/password`. See [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts).

### Admin password verification (throwaway client)

```typescript
const tempClient = createSupabaseClient(URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const { error } = await tempClient.auth.signInWithPassword({ email, password });
return !error;  // admin's real session is never touched
```

### Non-fatal child inserts

When writing to auxiliary tables that may not yet exist (e.g. `partnership_history` before its migration), wrap with `.then(()=>{}).catch(()=>{})` so a missing table doesn't cascade into a 500.

### Sidebar active-state precedence

In [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx), a regular nav item yields its active state to any sub-nav child (in any group) whose href is a longer match for the current path. That's why the flat "Surveys" link doesn't highlight when the URL is `/officer/surveys/analysis` — "Survey Analysis" under Analytics wins.

### Switch toggles (Base UI quirk)

shadcn v4.7.0 uses Base UI under the hood. Its `Switch` component doesn't reliably generate state-variant CSS for complex Tailwind data-attribute combinations. Use plain `<button role="switch">` with manual `aria-checked` and `onClick` handlers instead. See the Survey Builder Settings tab and per-question Required toggles.

---

## File Structure (current)

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── signup/
│   │   └── forgot-password/
│   ├── (dashboard)/
│   │   ├── layout.tsx                  (reads user profile from request headers)
│   │   ├── officer/
│   │   │   ├── page.tsx
│   │   │   ├── proposals/
│   │   │   ├── programs/
│   │   │   ├── surveys/                (builder + analysis subdir)
│   │   │   ├── volunteers/
│   │   │   ├── partnerships/
│   │   │   ├── donations/
│   │   │   ├── analytics/              (sdg, volunteers, community-needs, proposals sub-pages)
│   │   │   ├── impact/
│   │   │   └── reports/
│   │   ├── volunteer/
│   │   │   ├── page.tsx                (DB-backed dashboard)
│   │   │   ├── programs/
│   │   │   ├── schedule/               (calendar + class entry)
│   │   │   ├── surveys/                (NEW — interview surveys)
│   │   │   ├── log-activity/
│   │   │   └── hours/
│   │   ├── barangay/
│   │   └── admin/
│   │       ├── users/                  (edit + reset password)
│   │       └── ...
│   ├── api/                            (see full list above)
│   ├── accept-invite/                  (handles invite link + expired states)
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                             (shadcn — Card has built-in overflow-hidden; beware sticky)
│   ├── layout/
│   │   ├── Sidebar.tsx                 (active-state precedence + scrollbar-thin)
│   │   ├── Header.tsx
│   │   ├── DashboardLayoutClient.tsx
│   │   └── PageTransition.tsx          (0.15s animation, pathname key)
│   ├── maps/
│   │   ├── BarangayMap.tsx             (CartoDB tiles, filtered boundaries)
│   │   └── ProgramMap.tsx
│   ├── charts/
│   ├── forms/
│   └── shared/
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   (browser client)
│   │   ├── server.ts                   (server client)
│   │   └── admin.ts                    (service role, no session persist)
│   ├── ai/
│   ├── bocaue-boundaries.ts            (19 partner barangay polygons, bundled)
│   ├── nav-titles.ts                   (route → header title map)
│   ├── constants.ts                    (ROLE_MODULES — surveys added to volunteer)
│   └── utils.ts
├── types/
│   └── index.ts
├── hooks/
└── middleware.ts                       (auth + role redirect + profile header injection)

supabase/
└── migrations/                         (SQL files — run in Supabase SQL Editor)
```

---

## Performance Notes

- Page transition animation: cut from `0.4s` to `0.15s` ease-out and `translateY(16px → 4px)`. Defined under `.animate-page-in` in [src/app/globals.css](src/app/globals.css).
- Custom thin scrollbar utility: `.scrollbar-thin` — fully transparent at rest, soft brown on hover. Applied to the sidebar nav.
- Middleware now does a single `users` query and forwards `role / full_name / email / permissions` to the dashboard layout via request headers, eliminating one JWT verify + one DB query per navigation.

---

## Environment Variables (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LOCAL_AI_BASE_URL=http://localhost:3000/v1
LOCAL_AI_API_KEY=
LOCAL_AI_MODEL=llama3.2
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Never expose service role key or API keys in client code.

---

## Security Checklist

- [x] Supabase Auth with JWT on every request
- [x] RLS policies on owned tables (including new `volunteer_class_schedules`)
- [x] Protected routes via Next.js middleware
- [x] Role verification in every API route
- [x] Sensitive admin actions (set password, send reset email) require re-entered admin password
- [x] Admin password verified via throwaway non-persisting Supabase client (admin's real session untouched)
- [x] HTTPS everywhere (Vercel default)
- [x] Environment variables for all secrets
- [x] Input validation with Zod / server-side guards
- [x] Audit logging for sensitive actions

---

## Sprint Roadmap (full scope coverage)

### Phase 1 — Foundation

- **Sprint 1** ✅ Project Foundation — Next.js + Supabase + auth + middleware + dashboard layouts + auth pages
- **Sprint 2** ✅ User Management — admin invite, edit user (name/role/status/barangay/permissions), password reset with admin verification
- **Sprint 3** ⏳ Partnership Management — *finish*: `partnership_history` migration + timeline UI, volunteer `/volunteer/barangay` view, barangay-official own-partnership view

### Phase 2 — Core Operations

- **Sprint 4** ⏳ Community Needs Assessment — *extend*: `household_profiles` table + form, barangay community profile dashboard, twice-yearly cycle reminders
- **Sprint 5** ✅ Volunteer Management — programs, activity logs, schedule + classes, surveys
- **Sprint 6** ⏳ Proposal Workflow — *extend*: `is_income_generating` flag + gate, automatic pre-screening rule engine (needs match + SDG check + mission keywords), `finance_officer` role, auto-generated Project Participation Form PDF
- **Sprint 7** ⏳ Program Tracking — *finish*: two-report-per-activity workflow (Activity + Liquidation), completion checklist, activity photo uploads
- **Sprint 8** ✅ Donation & Resource Management — donor log, distribution tracking

### Phase 3 — Intelligence & Reporting

- **Sprint 9** ✅ Analytics & Reporting Foundation — 5 sub-pages, SDG Impact Tracker, all DB-connected
- **Sprint 10** 🆕 Report Exports & Comparative Analytics — PDF + Excel exports, scheduled monthly/quarterly/yearly snapshots, comparative analytics, barangay-scoped reports page
- **Sprint 11** 🆕 AI Features — Local AI gateway (OpenAI-compat) wired as default with Gemini fallback; narrative report + role-aware chatbot. Tool-use deferred (local gateway doesn't forward `tools`)
- **Sprint 12** ⏳ Impact Measurement — *full UI*: quantitative indicators per program, qualitative (testimonials/case studies/narratives), 6mo/1yr follow-up scheduler, pre/post comparison

### Phase 4 — Missing Modules

- **Sprint 13** ✅ Skill & Asset Documentation — `barangay_skills` + `barangay_assets` tables, officer CRUD UI
- **Sprint 14** ✅ Communication Expansion — email (Resend) + SMS (Semaphore) services with no-op fallback, per-user notification preferences, discussion forum
- **Sprint 15** ✅ Audit, Backup & Admin Polish — audit log viewer (real data + CSV/Excel export), backup info page, instrumented sensitive endpoints

### Phase 5 — Rescoping (8-role expansion + new gates)

After a scope refresh, modules were extended/aligned:

- **R-1** ✅ Role expansion (4 → 8) — DB constraint, central `lib/auth/roles.ts`, middleware + layout wiring, sidebar `dbRole` + per-item `roles?` allowlist, bulk RBAC refactor across ~41 API routes, admin invite/edit dropdowns grouped (PARAYA / Volunteer / Barangay)
- **R-2** ✅ Captain approval workflow — `community_needs.approval_status` + approval/rejection endpoints (Captain-only), `/barangay/approvals` queue page, submit-needs surfaces status badges + Captain notes, notifications fan out on submit/approve/reject
- **R-3** ✅ QR + OTP attendance — `attendance` table + `attendance_otp` columns on activities, officer page with QR (via api.qrserver.com) + rotate button + live roster, volunteer `/volunteer/check-in` auto-submits on QR scan via `?otp=` URL
- **R-4** ✅ Sitio-level granularity — `sitio` column on `household_profiles` + `community_needs`, form fields, "Households by Sitio" aggregation card on community-profile page, sitio surfaced in Captain queue
- **R-5** ✅ Labeling sweep — "Liquidation Report" → "Financial Report", signup role dropdown grouped into 6 roles, admin dashboard role colors/labels updated

### Phase 6 — Quality & Launch

- **Sprint 16** Testing & Refinement — unit + E2E tests, stakeholder bug bash, accessibility audit, mobile responsiveness pass
- **Sprint 17** Deployment & Documentation — production Supabase + Vercel, run migrations, per-role user guides, admin runbook, training materials, handover

### Scope → Sprint Coverage

| Scope Module | Closed by Sprint |
|---|---|
| User Management | 1, 2 |
| Partnership Management | 3 |
| Project Proposal & Approval | 6 |
| Community Needs Assessment | 4 |
| Volunteer Management | 5, 6 (PPF) |
| Skill & Asset Documentation | 13 |
| Program Tracking & Monitoring | 7 |
| Donation & Resource Management | 8 |
| Analytics & Reporting | 9, 10 |
| AI Narrative Report | 11 |
| Conversational AI Chatbot | 11 |
| Impact Measurement | 12 |
| Communication | 4 (reminders), 11 (chatbot), 14 (email/SMS/forum) |

---

## Known Pending Items

- **Run migrations** in Supabase SQL Editor (see "Migrations to Run" above). Newest required ones: `role_expansion.sql`, `community_needs_approval.sql`, `attendance.sql`, `sitio_columns.sql`.
- **AI provider:** chatbot + narrative reports call the Local API Generator at `LOCAL_AI_BASE_URL` (default `http://localhost:3000/v1`) using `LOCAL_AI_API_KEY` and `LOCAL_AI_MODEL`. If the local gateway is unreachable or unconfigured, the code falls back to `GEMINI_API_KEY` (`gemini-2.0-flash`). The Local API Generator and `ollama serve` must both be running; verify via `curl http://localhost:3000/admin/status`. Implementation: [src/lib/ai/local-ai.ts](src/lib/ai/local-ai.ts), [src/lib/ai/chatbot.ts](src/lib/ai/chatbot.ts), [src/lib/ai/narrative.ts](src/lib/ai/narrative.ts).
- **`RESEND_API_KEY` + `EMAIL_FROM`** for email dispatch via `notify()` helper (otherwise email is a no-op).
- **`SEMAPHORE_API_KEY` + `SEMAPHORE_SENDER_NAME`** for SMS dispatch (otherwise SMS is a no-op).
- Legacy users with `paraya_officer` / `barangay_official` still work via aliases — admins should re-assign to specific new roles when convenient.
- Cross-tabulation analytics (income × health × flooding × ICT) — survey cross-tabs view still pending.
- Scheduled monthly/quarterly/yearly report snapshots — needs Vercel Cron or Supabase Edge Function setup.
- `Textarea` ref warning inside a `Sheet` in the Proposals page — Textarea component needs `React.forwardRef()`.

---

## Important Constraints

- No offline mode — requires internet
- No native mobile app — responsive web only
- AI outputs are decision-support only, never final
- No pre-existing digital data — system starts fresh
- Sentiment analysis and advanced NLP deferred to Phase 2
- No integration with DYCI Student Information System unless API becomes available
