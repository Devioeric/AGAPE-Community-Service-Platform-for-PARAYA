# Phase 4 Volunteer Matching and Secure Invitations

## Status and release boundary

Phase 4 is implemented locally behind two independent server flags and database
runtime components. It is not enabled in shared or production environments.

| Capability | Server flag | Database component |
|---|---|---|
| Volunteer matching | `AGAPE_VOLUNTEER_MATCHING_V2_ENABLED` | `volunteer_matching` |
| Program invitations | `AGAPE_PROGRAM_INVITATIONS_V2_ENABLED` | `program_invitations` |

Both flags default to `false`; both component rows default to `off`. Synthetic
mode accepts only explicitly allowlisted test actors and program roots. Enabling
one component never enables the other.

## Volunteer preferences and privacy

Volunteers manage controlled skill codes, bounded weekly availability windows,
and an optional approximate base location. Location requires explicit consent
and is rounded before storage. A volunteer may select barangay/sitio without a
point, or provide an approximate point; exact addresses and continuous location
tracking are not collected. Withdrawing consent clears the current location
fields and records the withdrawal time.

The volunteer can read their own rounded preference values. Officer matching
DTOs never return the stored point. They disclose only a distance band and a
within/outside-radius result.

## Matching workflow

Authorized program staff configure one active primary site with venue,
barangay/sitio, schedule, custom radius, controlled skills, allowed courses,
year range, and optional signup deadline. Matching ranks candidates in the
locked order:

1. eligibility;
2. number of matched controlled skills;
3. availability after class-schedule conflicts;
4. straight-line Haversine proximity.

The officer may assign an eligible candidate through the existing governed
program-signup operation. Volunteers see eligible programs using the same
criteria and may sign up or withdraw through existing program workflows.

## Program leaders and invitation links

An officer may designate up to ten active, assigned volunteers as program
leaders. A leader can manage links only for their assigned program; the
database rechecks active leader ownership on every list, create, and revoke.
Ordinary volunteers receive no invitation-management authority.

Each link uses a 256-bit random URL token. Only its SHA-256 hash is stored.
Links:

- default to the program's remaining volunteer slots;
- expire within seven days or at the signup deadline, whichever is earlier;
- normally require the configured DYCI email domain;
- may allow an external address only through a PARAYA Director exception with
  a reason;
- can be revoked with an expected row version and reason;
- never reveal the token again after creation.

Existing volunteers sign in and consume the preserved token. New invitees may
register as the fixed Volunteer role and immediately join after eligibility and
capacity checks. A full program or eligibility concern creates one idempotent
waitlist entry for human review instead of silently enrolling the user.

## Audit and authorization

Creation, registration, join, waitlist, decision, failure, exhaustion, and
revocation append immutable events. Recipient identity in invitation audit is a
SHA-256 email hash; raw tokens and raw recipient addresses are not stored in the
event. Failure events use a fixed reason vocabulary and are written only when
the token maps to a program inside the active runtime mode.

All Phase 4 tables use restrictive RLS. Direct authenticated mutation is denied.
Fixed-search-path RPCs independently check actor status, capability/deny
override, program ownership, runtime mode, synthetic allowlists, expected
version, capacity, and audit durability. Token resolution and consumption are
service-only operations behind strict server contracts.

## Current verification

The initial Phase 4 migration passed a two-replay disposable full-chain gate
with all existing catalog, seeded, behavioral, and compatibility checks. The
leader-workspace and audit-completion migrations pass focused contracts,
typecheck, and targeted lint, but still require inclusion in the next disposable
full-chain replay. This document is an implementation record, not release
evidence.

## Rollback and deferred work

Rollback keeps both flags `false`, both runtime modes `off`, and workers no-op;
it retains all governed rows and immutable events. Applied defects use later
forward migrations.

Road routing, continuous tracking, public invitation directories, payments,
OCR, and blockchain are excluded. Blockchain Question 329 remains **Needs
confirmation**.
