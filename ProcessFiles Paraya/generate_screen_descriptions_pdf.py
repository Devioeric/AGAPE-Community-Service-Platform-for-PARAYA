# Generates a PDF describing every PARAYA officer wireframe screen
# Skips loading and empty-state screens per project direction.

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
)

# ---------------------------------------------------------------------------
# Content: ordered list of (feature_title, [(screen_label, paragraph), ...])
# ---------------------------------------------------------------------------

FEATURES = [
    ("Feature 1 - Dashboard", [
        ("Screen 1 - Default (Loaded)",
         "The home page an officer sees after login. The left sidebar lists every module with "
         "<b>[x] Dashboard</b> filled black to mark it active; the top header carries the page title "
         "plus a notifications bell and a user pill. The content area lays out four KPI cards "
         "(Total Volunteers, Volunteer Hours, Active Programs, Pending Proposals) for an at-a-glance "
         "snapshot of the portfolio, followed by a 6-month volunteer-hours bar chart and an SDG Impact "
         "panel with horizontal progress bars for the four priority goals. Below the charts, a Top "
         "Barangays ranking and a Recent Programs table give the officer two more drill-in paths into "
         "the data. A floating AI Chatbot button and a help <b>?</b> sit in the bottom-right and are "
         "available on every page."),
        ("Screen 2 - Notifications Open",
         "The officer clicked the bell. The dashboard content dims to 40% opacity behind a 380-wide "
         "dropdown anchored under the bell. The panel header reads 'Notifications' with a "
         "<i>Mark all read</i> link on the right, then lists up to five recent items - each with an "
         "unread dot or read circle, a bold title, an italic context sub-line, and a relative "
         "timestamp. A 'View all notifications -&gt;' link at the bottom opens the full inbox. Clicking "
         "outside the dropdown or pressing Esc closes it; opening the user menu also closes it because "
         "the two overlays are mutually exclusive."),
        ("Screen 3 - User Menu Open",
         "Same overlay pattern as the notifications dropdown but anchored from the user pill in the "
         "header. The pill flips its caret upward and inverts to black with white text to confirm it "
         "is open. A narrow ~260-wide panel drops down showing an identity block (name, email, role "
         "in parentheses), followed by four shortcuts - <i>My Profile</i>, <i>Notification "
         "Preferences</i>, <i>Help &amp; Support</i>, and a bolded <i>Sign Out</i> separated by a "
         "divider line so destructive actions sit apart from everyday ones."),
        ("Screen 4 - AI Chatbot Expanded",
         "The officer clicked the chatbot launcher in the bottom-right. A tall 320-wide panel slides "
         "up over the right side of the now-dimmed dashboard. Its black title bar reads "
         "'AGAPE Assistant' with an X close. Inside, a sample conversation shows a left-aligned "
         "greeting bubble, a right-aligned user question filled black, an answer bubble with real "
         "numbers, and an italic <i>[ TOOL CALL: ... ]</i> trace underneath proving where the answer "
         "came from. Two suggested-prompt buttons sit above a composer with a dashed text field and "
         "filled <b>[ SEND ]</b> button. The footer reads <i>Powered by Claude * decision-support "
         "only</i> - a reminder that the assistant surfaces information but never makes binding "
         "decisions."),
    ]),
    ("Feature 2 - Proposals", [
        ("Screen 1 - List (Default)",
         "The main proposals workspace. Five summary cards at the top show Total / Draft / In Review / "
         "Approved / Rejected counts; a pipeline-phase panel underneath shows where the in-review "
         "proposals sit across the 8-phase DYCI extension framework (Diagnostic, Research, Filing, "
         "Execution). Below that is a filterable table with search, status dropdown, and date-range "
         "inputs, listing every proposal with title, current pipeline stage, budget, and a status pill. "
         "Each row has a <b>[ &hellip; ]</b> action menu (View / Edit / Duplicate / Withdraw / Print "
         "PPF). The black <b>[ + NEW PROPOSAL ]</b> button is the only filled-black action on the page, "
         "drawing the eye to the primary task."),
        ("Screen 2 - New Proposal (Form)",
         "Right-side sheet (720 wide) that overlays the dimmed list. The form is grouped into three "
         "sections - Project Details (title, rationale, objectives), Beneficiaries &amp; Output, and "
         "Timeline / Budget / Location. A boxed <b>income-generating gate</b> with a labeled checkbox "
         "and warning text reminds the officer that PARAYA only funds non-income-generating projects "
         "- ticking it means pre-screening will auto-reject. The sheet auto-saves every 30 seconds; "
         "the sticky footer has <b>[ CANCEL ]</b> and filled-black <b>[ CREATE PROPOSAL ]</b>, which "
         "saves as a Draft rather than submitting it. SDG alignment and prior-proposal references sit "
         "below the fold."),
        ("Screen 3 - Detail (Draft)",
         "Proposal detail in its draft state. The title sits up top with a <i>(draft)</i> badge, "
         "followed by the approval pipeline strip with six pills (Draft is filled black to show "
         "current stage). Sections show rationale, objectives, a Timeline / Budget / Barangay row, "
         "SDG alignment tags, and a Community Validation block that must be marked complete before "
         "pre-screening per the PARAYA framework Phase II. The primary <b>[ &gt; SUBMIT FOR REVIEW ]</b> "
         "button advances the proposal to Submitted and locks every field; small recycle and X icons "
         "next to it are Withdraw and Reject shortcuts. <i>Edit Proposal</i> and <i>Delete</i> links "
         "at the bottom remain available until submission, and <b>[ Print Project Participation "
         "Form ]</b> in the header lets officers print the official PPF at any time."),
        ("Screen 4 - Detail (Pre-Screening Failed)",
         "Same detail layout but the pipeline strip shows 'Pre-Screening' with a failure indicator "
         "and a prominent failure card lists the automated checks that failed - missing SDG mapping, "
         "income-generating flag set, missing endorsement letter, or budget over threshold. Each "
         "failed check explains what needs to change. The action buttons swap to <b>[ REVISE &amp; "
         "RESUBMIT ]</b> (sends the proposal back to Draft so the officer can edit) and "
         "<b>[ WITHDRAW ]</b>. An audit trail at the bottom captures who ran the pre-screen and when, "
         "since the gate is automated rather than human-reviewed."),
        ("Screen 5 - Detail (Finance Review)",
         "Pipeline shows 'Finance' filled black. The page adds a Finance Review section with a budget "
         "breakdown table (item, qty, unit cost, total), a clearance checklist (CHED budget rules, "
         "permitted line items, no double-funding), and a reviewer notes textarea. Action bar exposes "
         "<b>[ APPROVE ]</b>, <b>[ REQUEST REVISIONS ]</b>, and <b>[ REJECT ]</b>, visible only to "
         "users with the finance reviewer role. Approval here advances the proposal to the Approved "
         "terminal state; rejection or revision requests route it back to the author."),
        ("Screen 6 - Detail (Approved)",
         "Pipeline shows 'Approved' as the final filled-black pill. A success banner at the top "
         "confirms the proposal cleared all gates and identifies the approver and approval date. Two "
         "prominent CTAs appear - <b>[ CREATE PROGRAM ]</b> (spins up a linked program seeded from the "
         "proposal's fields) and <b>[ PRINT PPF ]</b> (opens the printable Project Participation Form "
         "with signatures). The proposal becomes read-only; only the admin role can re-open it. A "
         "small audit trail at the bottom shows every stage transition and reviewer name."),
        ("Screen 7 - Detail (Rejected)",
         "Terminal state. The pipeline strip displays a rejected indicator and the body displays the "
         "rejection reason from the reviewer plus the audit trail of who rejected and when. Action "
         "options shrink to <b>[ APPEAL TO DIRECTOR ]</b> (escalates to the director's queue with a "
         "comment field) and <b>[ DUPLICATE AS NEW DRAFT ]</b> (clones the proposal so the officer "
         "can address the feedback and start over without losing the original record). The original "
         "stays in the system for the historical record and shows up in the Rejected count on the "
         "list."),
        ("Screen 8 - Detail (Revisions Requested)",
         "The proposal is back with the author. A boxed reviewer-comments block lists the requested "
         "changes with the reviewer's name, role, and timestamp - each comment can be marked as "
         "addressed once the officer edits the related field. The proposal switches back into edit "
         "mode with form fields editable, and the primary action becomes <b>[ RESUBMIT FOR REVIEW ]</b> "
         "once changes are saved. A small diff badge marks fields that have been edited since the "
         "last submission so the reviewer knows what to re-check."),
        ("Screen 9 - PPF Print View",
         "Full-page printable Project Participation Form on letter-sized paper. It renders DYCI "
         "letterhead, proposal metadata (title, date, proposer, barangay), full rationale and "
         "objectives, a beneficiary breakdown, the budget table, a signatures block for the proposer, "
         "the director, and the barangay captain, plus CHED reference codes. The application sidebar "
         "and header are hidden for clean printing. A floating <b>[ PRINT ]</b> button triggers the "
         "browser's print dialog; a <b>[ Download as PDF ]</b> option is also available for "
         "donor/email distribution."),
    ]),
    ("Feature 3 - Programs", [
        ("Screen 1 - List (Default)",
         "Programs module home. A KPI strip shows Active / Upcoming / Completed counts at a glance. "
         "Below, a filterable table lists every program with title, lead officer, barangay, start "
         "date, status, and a quick-actions menu. Filters across the top include status, lead, "
         "barangay, and date range. The black <b>[ + NEW PROGRAM ]</b> button is the primary action - "
         "it can spin up a program from an approved proposal or from a blank slate (rare, used for "
         "internal events that don't require formal proposal approval)."),
        ("Screen 2 - New Program Form",
         "Sheet-style form. The officer first picks the source proposal (if any) and the form "
         "auto-fills title, barangay, objectives, and budget from it. They then add activity dates, "
         "expected beneficiaries, lead officer, and any volunteer roles needed. A 'Mark this program "
         "as Brigada-style series' toggle links it to a recurring framework so future iterations "
         "auto-anchor against the same indicator targets. <b>[ CREATE ]</b> saves to draft so "
         "activities can be planned before going live."),
        ("Screen 3 - Detail Overview",
         "Program detail header with title, status pill, lead, dates, and barangay. Four tabs - "
         "Overview, Activities, Budget, Volunteers. The Overview tab shows objectives, "
         "indicators-to-date (e.g., '320 of target 500 beneficiaries reached'), a feed of recent "
         "updates, and a sidebar with proposal link, donor contributions, and SDG alignment. The "
         "header right side has <b>[ Mark complete ]</b> (available only when the program is ready to "
         "close)."),
        ("Screen 4 - Detail Activities",
         "Activities tab listing every scheduled and past activity for the program. Each row has "
         "title, date, location, attendance count, and report status (Activity Report / Financial "
         "Report - both required before the program can be marked complete). A filter chip strip "
         "above the table separates upcoming, in-progress, completed, and missing-report states. "
         "<b>[ + Add activity ]</b> opens the activity dialog; each row's <b>[ &hellip; ]</b> menu "
         "exposes Edit, Open attendance, File report, Cancel."),
        ("Screen 5 - Detail Budget",
         "Budget tab with a side-by-side table of planned vs actual line items, plus a "
         "remaining-balance card up top. Adjustments require a justification note for the audit log. "
         "Linked donations show as inflows in a left column; distributions show as outflows in a "
         "right column. A burn-rate sparkline helps the officer see whether the program is on track "
         "to finish on budget."),
        ("Screen 6 - Detail Volunteers",
         "Volunteers tab listing students signed up for the program with their college, role, hours "
         "logged, and attendance rate. Filters separate active / withdrawn / pending volunteers. "
         "<b>[ + Assign volunteer ]</b> opens a picker filtered by skills and availability, drawing "
         "from the global volunteer pool. Each row links to the volunteer's profile and offers a "
         "shortcut to message them via the forum."),
        ("Screen 7 - Add Activity Dialog",
         "Modal with date / time / location / lead / expected attendance / objectives. Toggles for "
         "'requires attendance OTP' (turn on if check-in tracking is needed) and 'open to walk-ins' "
         "(allows non-pre-registered volunteers to join). Saving schedules the activity, adds it to "
         "the volunteer schedule calendar, and creates an empty Activity Report and Financial Report "
         "stub that need to be filled in after."),
        ("Screen 8 - Add Report Dialog",
         "Modal for filing the two reports each activity needs - Activity Report (what happened, "
         "lessons learned, photos) and Financial Report (budget vs actual line items). The dialog has "
         "two tabs; both must be saved before the activity is marked reported. Photo attachments go to "
         "the activity-photos Supabase bucket. The Financial tab inherits planned line items from the "
         "program budget and asks the officer to fill in actuals."),
        ("Screen 9 - Mark Complete",
         "Confirm dialog before closing the program. A checklist enforces that all activities have "
         "both reports filed, every approved donation is distributed, and at least one impact "
         "indicator is logged. Marking complete locks all edits, auto-schedules the 6-month and "
         "1-year follow-up records in the Impact module, and unlocks the post-program impact summary "
         "and AI-narrative report for donor distribution. The dialog warns explicitly that this "
         "action cannot be undone without admin intervention."),
    ]),
    ("Feature 4 - Surveys", [
        ("Screen 1 - List (Default)",
         "All surveys in the office, filterable by Draft / Published / Closed. Each row shows title, "
         "audience (barangay scope or office-wide), response count, completion rate, and "
         "last-response timestamp. Search bar across the top. The black <b>[ + NEW SURVEY ]</b> button "
         "opens the builder. A 'Templates' shortcut to the right reuses existing surveys (e.g., the "
         "twice-yearly Community Profile baseline)."),
        ("Screen 2 - Builder (Tab)",
         "Three-pane builder layout. The left column is a drag-handle list of all questions in the "
         "survey; the center is a live form preview showing how respondents will see the page; the "
         "right is an Add-Question palette with question-type cards (single-choice, multi-choice, "
         "scale, text, date, file upload, conditional). Officers reorder by dragging. Top tabs "
         "switch between Builder, Settings, and Preview."),
        ("Screen 3 - Question Edit Panel",
         "Right-side panel that opens when a question is clicked in the builder. Inputs for the "
         "prompt text, question type (changeable via dropdown), required toggle, choice list "
         "(reorderable), validation rules (e.g., 'must be a number between 0-100'), and "
         "conditional-show rules ('show only if Q3 = Yes'). A 'Preview as respondent' link shows the "
         "question in isolation."),
        ("Screen 4 - Builder Settings",
         "Settings tab covering survey title, intro copy, audience scope (which barangays / which "
         "roles can submit), anonymous-toggle, deadline date, thank-you message, and per-event "
         "notification routing (alert me when a response comes in). Includes a 'Reuse template' "
         "picker to copy questions from an existing survey, useful for the twice-yearly community "
         "profile cycle."),
        ("Screen 5 - Builder Preview",
         "Renders the survey exactly as a respondent will see it - no editor chrome, just the "
         "form. Officers can scroll through every page, trigger conditional questions, attach test "
         "files, and submit a test response that is flagged as test and does <i>not</i> count toward "
         "real results. The big <b>[ PUBLISH ]</b> button at the bottom flips the survey live; once "
         "published, the structure becomes locked except for non-breaking edits like fixing typos."),
        ("Screen 6 - Analysis Charts",
         "Per-survey analytics view. Sticky header shows response total and completion rate. Each "
         "question renders the appropriate chart - bar for choice questions, histogram for scale, "
         "word-cloud for text - with the underlying counts visible on hover. Filters above let the "
         "officer slice by barangay, demographic, or date range. An <b>[ Export to Excel ]</b> button "
         "downloads the raw responses for offline analysis."),
        ("Screen 7 - Pre/Post Compare",
         "Two-column comparison of the same survey administered before and after an intervention "
         "(typically the baseline + 6-month follow-up). For each question, the two distributions are "
         "shown side-by-side with delta arrows and percentage change. Used for impact measurement "
         "against the indicators table and as input for narrative reports."),
        ("Screen 8 - Cross Tabs",
         "Pivot-table grid letting the officer cross any two questions. Rows are the values of "
         "question A, columns are the values of question B; cells show counts and percentages. "
         "Useful for spotting correlations (e.g., income bracket x access to internet, or sitio x "
         "child-out-of-school rate). The matrix can be exported as CSV for further analysis."),
        ("Screen 9 - Public Response Form",
         "Respondent-facing view of a published survey - no sidebar, just the DYCI/PARAYA header, "
         "a progress indicator across the top, and the question stack. Mobile-friendly so it works "
         "from a barangay hall on a tablet. Used by walk-ins and by volunteers conducting interviews "
         "in the field on behalf of beneficiaries. Each submission creates a row in survey_responses; "
         "the same survey can be submitted multiple times if it's set up for that."),
    ]),
    ("Feature 5 - Volunteers", [
        ("Screen 1 - List (Default)",
         "All volunteer-students in the office. Columns - name, college, total hours, status, last "
         "log. Filter chips for active / on-leave / suspended, plus search and barangay-assignment "
         "filter. A 'Pending Approvals' callout above the table summarises how many logs are "
         "waiting for officer review. Each row's <b>[ &hellip; ]</b> opens the actions menu (View / "
         "Edit / Suspend / Re-assign / Export hours certificate)."),
        ("Screen 2 - Pending Logs Expanded",
         "The 'Pending Approvals' section is expanded into a list of submitted activity-log entries. "
         "Each row shows the volunteer, activity, hours claimed, evidence (photo or signature), and "
         "approve / reject buttons. A multi-select with <b>[ Approve selected ]</b> and <b>[ Reject "
         "selected ]</b> at the bottom enables batch processing for high-attendance events like "
         "Brigada Eskwela. Rejecting an entry requires a short reason that the volunteer sees in "
         "their inbox."),
        ("Screen 3 - Detail (With Logs)",
         "Volunteer profile page. Header with avatar, name, college, contact, total hours, and an "
         "activity progress bar against the semester target. Below, a logs table lists every "
         "approved/pending entry with date, activity, hours, status, and the approver's name. "
         "<b>[ + ADD LOG ]</b> lets officers add a log on the volunteer's behalf (useful when a "
         "volunteer forgets to log). Right rail shows skills, signed-up programs, and recent "
         "attendance."),
        ("Screen 4 - Detail (Empty Logs)",
         "Same detail header but the logs table is replaced with an italic line - <i>'No hours "
         "logged yet.'</i> A first-log CTA encourages the officer to add an entry or assign the "
         "volunteer to a program activity. The right rail still shows the volunteer's skills and "
         "any programs they've signed up for - those are the natural next steps to actually "
         "generating hours."),
        ("Screen 5 - Detail (Suspended)",
         "Status pill in the header reads <i>suspended</i>. A banner explains the suspension "
         "reason and the unsuspend-on date (or 'indefinite, by admin'). The logs table is read-only; "
         "new logs cannot be filed against a suspended volunteer, and pending logs auto-reject when "
         "suspension takes effect. Admin / Director can unsuspend from the actions menu, which "
         "creates a record in the audit log."),
        ("Screen 6 - Row Actions Menu",
         "Context menu (popover) anchored to a row's <b>[ &hellip; ]</b>. Options - View detail, "
         "Edit, Suspend, Re-assign program, Export hours certificate (a downloadable PDF for OJT or "
         "CWTS credit). Destructive actions like Suspend or Delete sit at the bottom behind a confirm "
         "step. The menu adapts to the volunteer's current status (e.g., 'Unsuspend' replaces "
         "'Suspend' for already-suspended volunteers)."),
        ("Screen 7 - Bulk Approve Confirm",
         "Confirm dialog after the officer multi-selects pending logs and hits 'Approve selected.' "
         "Lists the volunteers and total hours about to be approved, plus a typed-confirm pattern "
         "('Type APPROVE to continue') to prevent fat-finger approvals during a large batch. After "
         "approval, each volunteer gets an in-app notification confirming their hours and total "
         "running balance."),
        ("Screen 8 - Hours Summary",
         "Aggregated hours by college, by program, and by month. Three side-by-side cards with "
         "bar / donut visuals. Used for end-of-semester CHED reports and to identify imbalanced "
         "distribution of volunteer time across the office's program portfolio. A small table at the "
         "bottom lists the top-5 most-engaged volunteers with a 'Send appreciation' shortcut that "
         "uses an email template."),
    ]),
    ("Feature 6 - Attendance", [
        ("Screen 1 - Selected (No Code)",
         "Officer picked an activity from the left-side list. Right pane shows the activity meta "
         "(title, date, location, expected count) and a placeholder where the live attendance code "
         "will appear. <b>[ GENERATE CODE ]</b> button is the primary action - clicking it creates "
         "a fresh OTP (One-Time Password) keyed to this activity. The list on the left filters to "
         "activities happening in the current 24-hour window by default; toggles expand to "
         "yesterday's or tomorrow's activities."),
        ("Screen 2 - Live Code (with QR)",
         "Attendance OTP is active. Right pane shows a large 6-digit code and a matching QR. A timer "
         "counts down to expiry (default 30 minutes). Volunteers either scan the QR with their "
         "mobile or type the 6-digit code into <b>/volunteer/check-in</b>. The officer keeps this "
         "screen open on a laptop or projector during the activity so attendees can see it. "
         "<b>[ Rotate ]</b> and <b>[ Extend ]</b> buttons sit below the code for recovery."),
        ("Screen 3 - Full Roster",
         "Live roster list under the active OTP - each check-in pops in with timestamp and method "
         "(QR / manual). The count vs expected attendance is displayed at the top with a progress "
         "bar. Officers can manually mark no-shows after the activity ends, which removes them from "
         "the auto-credit list. The roster supports search and basic edit (e.g., fix a wrong "
         "check-in time) with an audit-log entry per change."),
        ("Screen 4 - Code Expired",
         "Right pane shows the previous code crossed out with an <i>EXPIRED</i> ribbon. The roster "
         "is frozen and no new check-ins can land. Two recovery options - <b>[ EXTEND BY 30 MIN ]</b> "
         "(reuses the same code, preserving the roster) and <b>[ ROTATE NEW CODE ]</b> (generates "
         "a fresh code, also preserving the existing roster). The choice depends on whether the "
         "officer suspects the old code was shared too widely or just that the activity ran long."),
        ("Screen 5 - Rotating Code",
         "After tapping rotate, the previous code is voided and a fresh OTP+QR pair appears. The "
         "roster stays - existing check-ins are preserved. Used when an officer suspects the old "
         "code has been shared outside the activity (e.g., reposted on a group chat). The audit log "
         "captures the rotation event with the officer's name and timestamp so any disputes can "
         "be reconstructed later."),
        ("Screen 6 - Manual Entry",
         "Modal for adding a volunteer to the roster without an OTP - e.g. for someone whose phone "
         "died or who arrived late after the code expired. Officer picks the volunteer from a "
         "searchable dropdown, enters arrival time, and adds an optional note. Manual entries are "
         "flagged in the roster (a small 'manual' badge) for the audit log, since they bypass the "
         "automated check-in proof."),
        ("Screen 7 - Volunteer Check-in (Mobile)",
         "Volunteer's mobile view after scanning the QR. The activity title and barangay appear up "
         "top, then a 6-digit confirm field (auto-filled from the URL the QR encodes) and a big "
         "<b>[ CHECK IN ]</b> button. After tapping, a success state shows the volunteer's name, "
         "the activity, and the timestamp. They can also enter the code manually if QR scanning "
         "isn't available."),
        ("Screen 8 - Attendance Summary",
         "Post-event summary view - total attended, late arrivals, no-shows, walk-ins. Per-volunteer "
         "rows with arrival method and hours credited. <b>[ Export CSV ]</b> for record-keeping. "
         "This view feeds the volunteer hours module - approved attendance translates directly into "
         "logged hours, which the system queues for officer approval per the standard approval flow."),
    ]),
    ("Feature 7 - Partnerships", [
        ("Screen 1 - List (Default)",
         "Partner barangays module. The left side is a filterable table (name, captain, total "
         "programs, active needs, partnership age); the right side is a map of Bocaue with each "
         "partner barangay outlined as a polygon. Clicking a row on the table flies the map to "
         "that barangay; clicking a polygon on the map highlights the row. <b>[ + ADD "
         "PARTNERSHIP ]</b> is the primary action - reserved for the Director role."),
        ("Screen 2 - Add Form",
         "Sheet form to register a new partner barangay. Fields - name, captain (with phone + "
         "email), total population, total households, partnership start date, MOA file upload, and "
         "a map pin for the barangay hall location (drag to refine). The captain becomes the "
         "approver for community needs submitted from this barangay. A 'Notify captain' toggle "
         "sends an account-invitation email at save time."),
        ("Screen 3 - Edit Form",
         "Same fields as Add, pre-filled with the current values. Each edit saves an entry to the "
         "partnership-history audit log, so every change is traceable. Editing the captain triggers "
         "a confirmation step warning that the captain change will revoke the previous captain's "
         "approval access to needs submitted by this barangay."),
        ("Screen 4 - Detail Overview",
         "Per-barangay detail page. Header with name, captain, population, household count, "
         "partnership age. Tabs - Overview, Timeline, Programs, Households, Skills/Assets. The "
         "Overview tab shows a mini-map, key contacts, recent activity feed, and a small KPI strip "
         "(active programs / open needs / total hours invested). Right rail has 'Quick actions' "
         "shortcuts like message captain, schedule visit, log observation."),
        ("Screen 5 - Detail Timeline",
         "Append-only timeline of partnership events - MOA signed, MOA renewed, partner officer "
         "change, major activities hosted, escalations, follow-up visits. Filterable by event type. "
         "Used for tracking relationship history when officers turn over, so a new officer can read "
         "the full backstory in one place rather than chase down predecessors."),
        ("Screen 6 - Map Polygon Popup",
         "Officer clicked a barangay's polygon on the map. A popup card appears with name, captain, "
         "active programs count, pending needs count, partnership age, and an <b>[ Open detail "
         "-&gt; ]</b> link. Clicking outside the popup closes it. Useful for quickly identifying a "
         "barangay when planning a multi-barangay program based on geography."),
        ("Screen 7 - Inactivate Confirm",
         "Destructive confirm before marking a partnership as inactive. Lists the consequences - "
         "active programs paused, community needs frozen, captain loses access to approve new needs, "
         "and the barangay disappears from default lists. A typed-reason field captures why so the "
         "audit log explains the decision. Inactivation is reversible from the inactive detail page."),
        ("Screen 8 - Inactive Detail",
         "Read-only version of the detail page after a partnership has been inactivated. A banner "
         "across the top explains who inactivated, when, and why. Programs and needs are visible but "
         "frozen - no new ones can be added. <b>[ REACTIVATE ]</b> is the only available action; it "
         "opens a confirm dialog that lets the officer optionally re-invite the captain."),
        ("Screen 9 - Row Actions Menu",
         "Context menu off the <b>[ &hellip; ]</b> in the table. Options - View detail, Edit, View "
         "on map, Open captain profile, Message captain, Schedule visit, Inactivate. The menu "
         "adapts to the partnership's current state (e.g., Reactivate replaces Inactivate for "
         "already-inactive partnerships)."),
    ]),
    ("Feature 8 - Field Observations", [
        ("Screen 1 - List (Default)",
         "Field observation module - quick captures made by officers or volunteers in the field that "
         "may or may not become formal community needs. The list view has date, barangay, observer, "
         "brief description, photo thumbnail, and status (raw / promoted / dismissed). Designed for "
         "noticing things before they're worth formalising - an opening for early intervention."),
        ("Screen 2 - List Filtered",
         "Same list with active filters applied - by barangay, date range, observer, or category. "
         "A filter chip strip above the table shows what's applied, with an X on each chip to remove "
         "it. A 'Clear all' link resets. The filter URL is shareable so officers can paste it in a "
         "forum thread to point teammates at a specific subset."),
        ("Screen 3 - New Observation",
         "Capture form. Fields - what was observed (textarea), where (barangay + sitio + optional "
         "map pin), when (defaults to now), category (sanitation / education / health / etc.), and "
         "photos (camera or gallery on mobile). Designed for mobile-first quick capture during a "
         "barangay visit, so the form is short and the photo upload is prominent."),
        ("Screen 4 - Edit Observation",
         "Same form as New, pre-filled. Edits are audit-logged with the editor's name. Photos can "
         "be added or removed but not replaced - the photo history is preserved so reviewers can "
         "see what was originally captured. Category changes propagate to the AI insights grouping."),
        ("Screen 5 - Detail View",
         "Single observation detail page. Photo gallery up top (swipeable), then the observation "
         "text, location pin, tags, and a comments thread for officers to discuss the observation. "
         "Right rail shows the observer's profile, the related barangay's stats, and a 'similar "
         "observations' list. Actions - <b>[ Promote to need ]</b>, <b>[ Dismiss ]</b>, "
         "<b>[ Edit ]</b>."),
        ("Screen 6 - Promote to Need",
         "Dialog that converts an observation into a formal community need that goes through the "
         "captain approval workflow. Pre-fills the need form from observation fields (description, "
         "category, location), lets the officer edit before submitting, and links the resulting need "
         "back to the original observation so the history is preserved."),
        ("Screen 7 - Photo Upload",
         "Photo attach UI inside the New / Edit forms - drag-and-drop zone, thumbnails of attached "
         "photos, per-photo caption input, and a 'blur faces' toggle for privacy. Photos go to the "
         "activity-photos Supabase bucket. Maximum 10 photos per observation; each photo can be up "
         "to 8MB before client-side compression kicks in."),
        ("Screen 8 - Insights by Category",
         "AI-generated rollup grouping observations by themes (flooding, sanitation, education, "
         "income, health). Each theme shows the count, top barangays, and a one-sentence narrative. "
         "Helps officers spot emerging patterns across the office's coverage area before they "
         "become urgent. Clicking a theme drills into the filtered observation list."),
        ("Screen 9 - Delete Confirm",
         "Destructive confirm. Warns that the observation will be permanently removed (or only "
         "soft-deleted if it has already been promoted to a need, since the linked need still "
         "references it). A typed-reason field captures why for the audit log. Deletion is "
         "reserved for clear duplicates or test entries - active observations should be dismissed "
         "instead so the history stays intact."),
    ]),
    ("Feature 9 - Community Profile", [
        ("Screen 1 - List (Default)",
         "Top-level community profile module. One row per partner barangay with population, "
         "household count, needs density, last-profiled date, and a 'completeness' percentage. "
         "<b>[ + Add household ]</b> is the primary action; clicking a barangay row drills into the "
         "barangay dashboard."),
        ("Screen 2 - Barangay Dashboard",
         "Per-barangay overview. KPI strip shows households profiled, average household size, and "
         "the top need category. Side-by-side charts of household income distribution and a needs "
         "heatmap by sitio. A 'Last profiling cycle' indicator helps researchers see whether the "
         "barangay is due for a refresh (the framework asks for twice-yearly cycles)."),
        ("Screen 3 - Sitio Drilldown",
         "Drills into one sitio within a barangay. Lists the households profiled there with quick "
         "filters by income, household size, and at-risk flags (children out of school, elderly with "
         "chronic illness, etc.). Mother Leaders use this view to plan their next round of home "
         "visits and to confirm whether at-risk flags have changed."),
        ("Screen 4 - New Household Form",
         "Capture form for a household profile - head of household, members (with relationship + "
         "age + occupation), address, income source, income range, key needs/risks, and an optional "
         "photo of the dwelling. The form is long so it's chunked into sections (Basic info, "
         "Members, Income, Needs, Photo) with a progress indicator at the top."),
        ("Screen 5 - Edit Household",
         "Same form pre-filled. Edits are audit-logged. Some fields require Mother Leader signoff "
         "before saving (e.g., adding a new at-risk flag, which has program-eligibility "
         "consequences). Member edits are tracked individually so household composition history is "
         "preserved."),
        ("Screen 6 - Household Detail",
         "Single household profile. Members list with demographics, full needs assessment, history "
         "of program interactions, photos. Actions - Edit, Schedule follow-up visit, Tag for next "
         "program outreach. The right rail shows the household's sitio context and nearby households "
         "with similar profiles."),
        ("Screen 7 - Income Distribution",
         "Single-page chart drilling into income brackets across the barangay. Stacked bars by sitio "
         "with a comparison line for the Bocaue / Bulacan provincial average. Source citations sit "
         "underneath. Used for proposal-writing - officers can quote real numbers when justifying "
         "an intervention's target group."),
        ("Screen 8 - Needs Heatmap",
         "Sitio-level heatmap of community needs. Each sitio is a tile; darker shading = more open "
         "needs. Click a tile to drill into the Sitio Drilldown. Filter chips up top let the officer "
         "focus on a single need category (education, health, livelihood, infrastructure, etc.) so "
         "the heatmap re-shades to that single dimension."),
        ("Screen 9 - Delete Confirm",
         "Destructive confirm before deleting a household profile. Warns that linked program "
         "beneficiaries will be re-anchored to 'unknown household,' losing the demographic detail. "
         "Typed-reason field for the audit log. Deletion is rare - households that have moved out "
         "are usually marked inactive instead so the history stays."),
    ]),
    ("Feature 10 - Skills & Assets", [
        ("Screen 1 - Skills List",
         "Skills inventory across all partner barangays. Each row - skill name, barangay, count of "
         "people with that skill, last verified. Filter chips for category (technical, livelihood, "
         "health, agricultural, etc.). Anonymised at the individual level for privacy - the database "
         "stores counts, not names, since the survey workflow asks people to self-identify rather "
         "than be listed."),
        ("Screen 2 - Skills Heatmap",
         "Barangay-by-skill matrix grid - rows are barangays, columns are skill categories, cells "
         "show density (darker = more people with that skill). Helps officers spot which barangays "
         "already have capacity in an area (potential trainers) and which are gap areas (potential "
         "trainees). Clicking a cell drills to the underlying records."),
        ("Screen 3 - New Skill",
         "Form to add a skill record - barangay, skill, count of people with that skill, source "
         "(survey / interview / self-report), date verified. Used when the researcher returns from a "
         "community profiling visit and needs to update the inventory. A 'related skills' suggestion "
         "appears below the skill field to encourage consistent naming (e.g., 'sewing' vs "
         "'dressmaking')."),
        ("Screen 4 - Edit Skill",
         "Same form pre-filled. Edits audit-logged. Counts can be incremented or decremented over "
         "time - the system keeps a running total per skill per barangay so trends are visible in "
         "the analytics module. Editing the source citation is supported so older records can be "
         "annotated with a follow-up survey reference."),
        ("Screen 5 - Assets List",
         "Community assets inventory - barangay halls, multi-purpose centers, computers, tents, "
         "vehicles, equipment that can be loaned for activities. Each row has type, owner, condition, "
         "barangay, last verified. Filter chips for type (venue / equipment / vehicle) and "
         "availability (free / busy / restricted)."),
        ("Screen 6 - New Asset",
         "Form for adding a community asset - type (venue / equipment / vehicle), owner (barangay / "
         "school / NGO / individual), condition, capacity (e.g., 'seats 200'), location pin, and "
         "contact info for borrowing. A 'standard equipment' toggle marks recurring items (e.g., "
         "DYCI-owned tents) for fast lookup."),
        ("Screen 7 - Assets Map",
         "Map of partner barangays with asset pins overlaid. Pin shapes represent asset categories. "
         "Click a pin to see asset details. Used when planning a program to find the closest "
         "available venue or to coordinate equipment loans between barangays. Filter chips above "
         "the map narrow to a single category."),
        ("Screen 8 - Delete Confirm",
         "Destructive confirm for either a skill record or an asset. Includes a 'soft delete - keep "
         "historical record' option that hides the row from default views but preserves it for "
         "audits, used when an asset is destroyed or a skill cohort moves out of the barangay."),
    ]),
    ("Feature 11 - Donations", [
        ("Screen 1 - List (Default)",
         "Donations module home. A KPI strip up top shows Total intake / Cash share / In-kind share "
         "/ Pending distribution counts. A filterable table lists every donation with donor, item, "
         "quantity, value, date, and status (received / partially distributed / fully distributed). "
         "Filters by donor type, period, and status. The black <b>[ + LOG DONATION ]</b> is the "
         "primary action."),
        ("Screen 2 - New Donation",
         "Right-side sheet to capture an intake. Sections - Donor (name, type, contact), Item "
         "(cash / in-kind / service / equipment, description, qty, est. value), Intake (date, "
         "received-by, storage location), and an optional Recipient Assignment block for "
         "earmarking. The footer has three buttons - <b>[ Cancel ]</b>, <b>[ Save &amp; Close ]</b>, "
         "and <b>[ Save &amp; Distribute ]</b>, which saves the donation and immediately opens the "
         "distribute dialog."),
        ("Screen 3 - Detail With Distributions",
         "Donation detail page. Donor + item header at the top, then a progress bar showing the "
         "percentage of the donation that has been distributed, then a list of distribution rows "
         "(date, recipient, qty, distributor name). A remaining-balance card on the right suggests "
         "the next distribution based on open requests or earmarks. <b>[ + DISTRIBUTE ]</b> opens "
         "the distribute dialog. Edit and Delete are available from the row menu."),
        ("Screen 4 - Distribute Dialog",
         "Modal to record a distribution. Picks recipient type (program / barangay / household / "
         "individual), quantity (bounded by remaining balance), regular vs disaster mode toggle, and "
         "an acknowledgment checklist (photo on file, signature collected, no double-counting). "
         "Saving subtracts from the donation's remaining balance and adds the recipient to the "
         "donation's distribution list."),
        ("Screen 5 - Disaster Mode",
         "A special dashboard view used during active disaster events. Shows the live event banner "
         "across the top, an open-requests queue (urgency-ranked from affected barangays), "
         "earmarked donations awaiting deployment, coverage gaps where supply doesn't meet request, "
         "and a live dispatch log with timestamps. Designed for fast-tempo coordination - shortcuts "
         "for SMS broadcasts and one-click dispatching."),
        ("Screen 6 - Cash vs In-Kind Analytics",
         "Analytics sub-page. Two large charts - monthly value split between cash and in-kind, plus "
         "a stacked horizontal breakdown by donor type. Beneath, a table of top in-kind categories "
         "with value, recipients reached, and stock-on-hand. AI insights call out concentration risk "
         "(e.g., one donor is too large a share) and stagnant inventory (donations sitting in "
         "storage too long). Used for board-level reporting."),
        ("Screen 7 - Donor History",
         "Per-donor profile. Lifetime KPIs (total value, donation count, people reached), then a "
         "history table of every donation with type, items, value, recipients. A 'Relationship "
         "notes' block captures soft info like preferred contact, renewal timing, donor's preferred "
         "framing of impact stories. Used to prep for donor briefings or thank-you letters."),
        ("Screen 8 - Edit Donation",
         "Sheet form pre-filled with the donation's current values. Edits to amount or item type "
         "are flagged in the audit log. If the donation has distributions, the value field is "
         "locked behind an explicit 'Unlock to edit' link to prevent accidental amends that would "
         "make distributions inconsistent. The donor name change requires director-level "
         "confirmation."),
        ("Screen 9 - Delete Confirm",
         "Destructive confirm. Warns if distributions exist (they will be removed too, and "
         "recipient counts will recompute). Requires the officer to type the donor name as a "
         "fat-finger guard. Optional reason field for the audit log - usually 'duplicate entry,' "
         "'wrong donor selected,' or 'returned by donor.'"),
    ]),
    ("Feature 12 - Analytics", [
        ("Screen 1 - Overview (Default)",
         "Analytics landing page. Four KPI cards (Programs, Volunteers, Approved Hours, Donations) "
         "across the top, each with an icon and a sub-line of context. Then an SDG Impact strip "
         "with the four priority goals shown as progress bars. Below that, six chart cards in a "
         "grid - monthly volunteer hours, programs by status, donations by item type, community "
         "needs by category, top barangays by programs, and the proposal pipeline overview."),
        ("Screen 2 - Filter Sheet",
         "Right-side sheet that opens when the officer clicks <b>Filters</b> in the page header. "
         "Inputs for partner barangay (dropdown of the office's 19 barangays) and calendar year. "
         "A live filter-preview block shows what will change before applying so the officer can "
         "double-check before they hit Apply. The sheet has three buttons in the footer - Apply, "
         "Reset, Cancel."),
        ("Screen 3 - SDG Impact",
         "Sub-page focused on SDG alignment. Four big SDG goal cards with progress bars and "
         "supporting stats (programs aligned, beneficiaries reached). Below that, a "
         "year-over-year stacked-bar trend chart shows how each SDG's contribution has shifted "
         "over time. An AI insights panel on the right calls out under-represented SDGs and "
         "recommends specific program proposals to close the gap."),
        ("Screen 4 - Volunteers",
         "Sub-page focused on volunteers. Five KPI cards (total, active, hours, avg per volunteer, "
         "attendance rate). A weekly trend line shows the last 12 weeks of hours logged. A top-10 "
         "leaderboard, by-college breakdown bars, and a retention &amp; attrition block (returning "
         "vs new mix, dormant-volunteer flags, predicted attrition for the next 30 days) round out "
         "the page."),
        ("Screen 5 - Community Needs",
         "Sub-page focused on the open community needs queue. KPIs (total submitted, pending captain "
         "approval, approved, returned for revision). Needs-by-category bar chart, an urgency mix "
         "donut, a sitio-level heatmap of where needs are concentrated, and a top-5 unmapped-needs "
         "panel that lists needs without a linked program."),
        ("Screen 6 - Proposal Pipeline",
         "Sub-page that visualizes the proposal funnel - six stages from Draft to Approved, with "
         "conversion rates between each stage labelled on the connectors. Bottleneck callouts flag "
         "stages that are running over SLA. A time-in-stage breakdown chart and a rejection-reasons "
         "panel with an AI insight about repeat rejection causes (e.g., 'most rejections fail SDG "
         "mapping at first submission')."),
        ("Screen 7 - Survey Analysis",
         "Sub-page listing every survey with response count, completion rate, and last response. "
         "Clicking a survey opens a drill-in preview pane with the first few questions' charts and "
         "a right-side AI summary panel that produces narrative insights from the responses. Used "
         "as the entry point to the deeper Survey Analysis page in the Surveys module."),
        ("Screen 8 - AI Narrative Dialog",
         "Modal that opens when the officer clicks <b>Generate narrative report</b>. The left side "
         "has the report config - type (quarterly impact / monthly progress / donor brief), time "
         "range, sections to include (checklist), tone (formal / donor-friendly / executive brief), "
         "and a free-text 'custom instructions' field. The right side shows a live preview of the "
         "streaming narrative as Claude generates it. Footer - Cancel / Save draft / Generate."),
    ]),
    ("Feature 13 - Impact", [
        ("Screen 1 - Metrics (Default)",
         "Impact measurement home. Three tabs across the top - <b>Metrics</b>, <b>Stories &amp; "
         "Testimonials</b>, <b>Follow-ups</b>. The Metrics tab shows four KPI cards "
         "(beneficiaries reached, families served, trainings conducted, materials distributed), "
         "then a filterable indicator table where each row is one logged measurement, and a small "
         "bar chart at the bottom summarising the indicator categories. <b>[ + Log indicator ]</b> "
         "is the primary action."),
        ("Screen 2 - Log Indicator Dialog",
         "Modal to log a new quantitative indicator. Officer picks the program, indicator type "
         "(beneficiaries / families / trainings / materials / volunteer hours / custom), value, "
         "unit, recorded date, and SDG tag. A disaggregation row (male / female / youth / senior) "
         "splits the total - the sums must reconcile to the total value. A free-text notes field "
         "captures context. Saved indicators are audit-logged so any later edits are traceable."),
        ("Screen 3 - Stories Tab",
         "Stories tab of the Impact module. A card list of testimonials, case studies, pre/post "
         "narratives, and field observations - each tagged by type and program. Case-study and "
         "pre/post cards display formatted body text; testimonial cards lead with a quote-mark "
         "treatment. Stories form the qualitative side of impact measurement, complementing the "
         "indicator counts on the Metrics tab."),
        ("Screen 4 - Add Story Dialog",
         "Modal to add a story. Type chips (testimonial / case study / pre-post narrative / "
         "observation), program picker, date, consent toggle, subject info (anonymizable), body "
         "text, optional auto-translation via AI for Tagalog stories, freeform tags, and a media "
         "attachment field for photo or voice note. Stored in the impact_qualitative table. Faces in "
         "photos are blurred by default in donor exports unless consent is explicitly recorded."),
        ("Screen 5 - Follow-ups Tab",
         "Follow-ups tab. KPI strip shows Overdue / Scheduled / In Progress / Completed counts. "
         "Filterable table of every follow-up record with status, type (6-month / 1-year), "
         "associated program, scheduled date, completed date. Overdue rows are emphasized for "
         "visibility. A footer panel explains the reminder rules - when in-app alerts fire, when "
         "email reminders fire, when SMS escalations fire."),
        ("Screen 6 - Follow-up Detail",
         "Single follow-up record. A top warning banner appears if overdue. A program overview block "
         "summarises the original program. A checklist of steps that must be completed for this "
         "follow-up (re-survey sample, teacher feedback, attendance vs dropout delta, capture "
         "testimonials, send final report). A pre/post comparison table populates as the checklist "
         "is completed, eventually unlocking the <b>[ Mark complete ]</b> action."),
        ("Screen 7 - Program Impact Summary",
         "Program-level rollup that combines quantitative indicators, qualitative stories, and "
         "follow-up outcomes into a single shareable page. Used as the source material for narrative "
         "reports and donor briefs. <b>[ Export PDF ]</b> and <b>[ Send to donor ]</b> sit in the "
         "header. The page is structured by 'outcome' rather than 'feature' so it reads as a story "
         "rather than a dump of stats."),
        ("Screen 8 - Edit Indicator",
         "Sheet form pre-filled with an existing indicator's current values. Warns at the top if "
         "the indicator already appears in a published AI report (since editing the number changes "
         "what the report cited). The audit trail at the bottom shows every prior edit with author "
         "name and timestamp. Indicators tied to closed programs are read-only unless the user is "
         "an admin."),
        ("Screen 9 - Delete Confirm",
         "Destructive confirm. Warns about published reports that cite this indicator - they will "
         "not be retroactively edited; instead, a 'source data deleted' banner appears on them. "
         "Requires a typed reason and a typed-DELETE-INDICATOR confirmation. Useful for clearing "
         "duplicate or fat-finger entries; closed-program indicators usually need an admin to "
         "delete."),
    ]),
    ("Feature 14 - Reports", [
        ("Screen 1 - Reports (Default)",
         "Reports module landing page. Four quick-action cards at the top (Quarterly impact PDF, "
         "Excel data export, Donor 1-pager, Compliance bundle) - each launches a tailored wizard. "
         "Below that, a recent reports table with title, type, created date, author, status, format, "
         "and per-row actions. A scheduled snapshots strip at the bottom lists upcoming cron-fed "
         "reports so the officer knows what's about to auto-generate."),
        ("Screen 2 - New Report Wizard",
         "Step 1 of 4 of the report builder. Officer picks one of four report types (Compliance "
         "bundle / Quarterly impact PDF / Donor 1-pager / Raw data export). Each type card shows "
         "the audience, format, and length so the choice is informed. Progress bar at the top tracks "
         "the four-step flow; footer has Cancel and Next."),
        ("Screen 3 - Section Picker",
         "Step 3 of 4. Two-column layout - left is the library of 14 available sections (cover "
         "page, executive summary, KPI dashboard, SDG progress, programs delivered, stories, photo "
         "gallery, methodology, etc.); right is the drag-orderable list of sections currently in "
         "the report, plus a page-count estimate. Each section can be removed individually or "
         "reordered."),
        ("Screen 4 - Preview",
         "Live preview after generation. The left rail lists the sections like a table of contents; "
         "the right side renders the selected section in its final formatted state. The action bar "
         "in the header - Edit / Re-generate / Send to donor / Download / Publish. A quick facts "
         "panel below the section list shows page count, AI generation cost, sources cited, and "
         "generation timestamp."),
        ("Screen 5 - Send to Donor",
         "Modal to email the report. Audience picker (specific donors / all partner barangays / "
         "internal / public link), recipient checklist with each donor's funding share for the "
         "period, editable email subject and body templates, attachment list, and tracking options "
         "(open tracking, auto-log to donor history, schedule send for later). The send action "
         "creates audit-log entries per recipient."),
        ("Screen 6 - Scheduled Snapshots",
         "Tab showing the cron jobs that auto-generate reports. Each schedule card has trigger "
         "spec (cron expression), scope, recipients, next-run countdown, last-run status, and a "
         "per-row Run-now / Edit / Duplicate / Delete menu. A toggle switch on each card pauses or "
         "resumes the schedule without deleting it. The monthly snapshot and quarterly impact "
         "schedules are pre-seeded; office-specific ones can be added."),
        ("Screen 7 - Templates",
         "Tab listing the reusable report templates. Two protected system templates (CHED Activity "
         "Report, CHED Financial Report) cannot be deleted or edited - they're system-managed for "
         "compliance. Custom office-specific templates can be created from any existing report via "
         "'Save as template.' Per-template card shows section list, last-used date, and actions "
         "(Use, Preview, Duplicate, Edit, Delete)."),
        ("Screen 8 - Delete Confirm",
         "Destructive confirm for a report. Warns if the report has been sent to donors - deletion "
         "does NOT recall those emails. Offers an 'Archive instead - kept 90 days then auto-purged' "
         "softer option for officers who want to remove the report from default views without "
         "permanently destroying it. Typed-DELETE-REPORT confirmation required for the permanent "
         "option."),
    ]),
    ("Feature 15 - Forum", [
        ("Screen 1 - Threads List",
         "Forum landing page. The left rail is a channel list (General, Announcements, Programs, "
         "Partnerships, Disaster response, Captains &amp; Mother Leaders, Volunteers' lounge, etc.) "
         "with per-channel unread counts. The right pane is the thread list for the active channel. "
         "Each thread row shows title, author, last-reply meta, and unread badge. Pinned threads "
         "and live-event threads sit at the top. <b>[ + New thread ]</b> is the primary action."),
        ("Screen 2 - Thread Detail",
         "Single thread view. The original post (OP) card sits at the top with author avatar, role "
         "badge, body text, mentions, reactions, and a publication timestamp. A reply list "
         "underneath uses the same card structure. A sticky reply composer sits at the bottom of "
         "the page with mention / attach / emoji shortcuts so the officer doesn't lose context "
         "while scrolling."),
        ("Screen 3 - New Thread",
         "Composer page for starting a new thread. Channel picker dropdown, title field, rich-text "
         "body editor with a toolbar (bold / italic / list / link / image / mention / code), "
         "attachments list, and options (notify channel members, subscribe me to replies, pin if "
         "permitted, lock-to-roles for private threads). Save-draft and Post-thread buttons sit "
         "in the footer."),
        ("Screen 4 - Mentions Inbox",
         "Filtered view of every place the user has been mentioned with @. Left sub-nav lets the "
         "user switch between All threads / Mentions / My posts / Subscribed / Saved / Drafts. "
         "Mention cards show the source thread, the snippet around the mention, and a "
         "reply-inline action so the officer can respond without navigating to the full thread."),
        ("Screen 5 - Disaster Channel",
         "Special live-event channel that auto-activates during a declared disaster. A red top "
         "banner identifies the event; the feed below is time-ordered posts from field volunteers, "
         "captains, mother leaders, and officers. A sticky SMS-broadcast composer at the bottom can "
         "blast a single message to every channel subscriber via Semaphore. Used for fast "
         "coordination during typhoons, fires, or other emergencies."),
        ("Screen 6 - Search Results",
         "Full-text search results across threads, replies, and attachments. Each result has a "
         "type chip (Thread / Reply / Attachment), channel breadcrumb, highlighted matched terms "
         "in the body snippet, and an Open-thread link. The filter row narrows by channel, type, "
         "author, and date range. Used for recovering historical context (e.g., 'how did we handle "
         "the last Brigada Eskwela tarpaulin sourcing?')."),
        ("Screen 7 - Channel Settings",
         "Settings page for one channel. Sub-nav on the left for General / Members &amp; permissions / "
         "Notifications / Moderation / Integrations / Danger zone. The General tab covers name, "
         "topic, visibility (public / role-restricted / invite-only), who can post, slow mode, "
         "auto-archive threshold, and attachments toggle. Only the channel owner or admin can edit."),
        ("Screen 8 - Moderation",
         "Moderator queue. A KPI strip (open flags / resolved this week / members on warning / "
         "average resolve time) followed by a list of flagged threads or replies. Each flag has a "
         "severity tag, the reported reason, the reporter's name, and one-click mod actions "
         "(Approve in place / Remove / Warn user / Ban user / Move post to a different channel). "
         "Moderators are the Director and Admin roles."),
        ("Screen 9 - Delete Thread",
         "Destructive confirm before deleting a thread. Warns about the reply count and how many "
         "different authors are involved - deleting impacts everyone, not just the OP. Offers two "
         "options - Archive (kept 30 days then purged) or Hard delete (permanent). A reason field "
         "is required for the audit log so the moderation decision is documented."),
    ]),
    ("Feature 16 - Notifications", [
        ("Screen 1 - Bell Dropdown",
         "Header-level dropdown that opens when the bell is clicked. Lists the five most recent "
         "notifications with severity treatments (disaster, approval, mention, system). Each item "
         "has a left side-bar marking its category, a bold title, a context body line, and a "
         "timestamp. Quick toggles at the bottom for email / SMS / quiet hours give one-click "
         "control without leaving the dashboard. A link to full settings sits underneath."),
        ("Screen 2 - Inbox (Default)",
         "Full notification inbox page. The left side-nav has folders - All / Unread / Mentions / "
         "Approvals / Reminders / System / Disaster / Archived / Snoozed - each with a per-folder "
         "count. The right side renders the notification feed grouped by Today / Earlier. Each "
         "notification card has an icon, title, body, source channel, time, and per-row Open / "
         "Snooze / Mark-read actions."),
        ("Screen 3 - Disaster Toast",
         "Site-wide disaster banner across the header plus a stack of toast cards in the "
         "bottom-right. The first toast is a live alert with a primary CTA (e.g., Open response). "
         "The second tracks SMS broadcast delivery progress. The third shows director "
         "acknowledgement. Toasts auto-dismiss after a minute but can be pinned, and the banner "
         "persists until the disaster event is closed."),
        ("Screen 4 - Settings",
         "Notification preferences page. The top row has channel cards (in-app / email / SMS / "
         "Messenger) with on-off and address per channel. The middle table is the per-event routing "
         "matrix - rows are event types (disaster, approval, mention, follow-up, etc.), columns are "
         "channels, cells are checkboxes for which channels each event hits. The bottom block "
         "configures quiet hours with weekday-only toggle."),
        ("Screen 5 - Detail View",
         "A single notification expanded into a detail page. The top meta block shows the source, "
         "status, channels delivered to, and timestamps. The middle has the context that triggered "
         "the notification (e.g., the two needs awaiting approval, with links). A right-side panel "
         "lists related notifications. The action bar at the bottom - Open queue / Quick approve / "
         "Snooze / Forward / Mark read / Archive."),
        ("Screen 6 - Snooze Dialog",
         "Modal that opens from the Snooze action. A preview of the notification being snoozed "
         "sits up top, then radio options for the snooze timing - Later today, Tomorrow morning, "
         "Monday morning, After my next meeting block, or Custom date-time. A 'note to future self' "
         "field captures why the officer is deferring. Warns explicitly that disaster alerts cannot "
         "be snoozed."),
        ("Screen 7 - Archived",
         "Archived-folder view of the inbox. Cards are styled as faded or secondary to show they're "
         "done. Each card shows the auto-purge countdown (default 6 months for most categories, "
         "5 years for disaster items per audit policy). Per-card Restore / Delete-now actions. A "
         "Search field above the list helps recover specific historical alerts during audits."),
        ("Screen 8 - Broadcast Compose",
         "Director-only tool for sending a notification to many users at once. The left side is the "
         "compose form (severity / audience / channels / title / body / schedule). The right side "
         "shows a live preview of how the broadcast will look in the inbox and email, plus an "
         "automated sanity-check panel (severity matches body tone, audience scope sensible, last "
         "broadcast recency, SMS cost estimate)."),
        ("Screen 9 - Delivery Log",
         "Admin-only audit log of every notification sent. A KPI strip up top (sent today, open "
         "rate, SMS delivered, failed last 24h, SMS spend MTD). Filter bar by channel / status / "
         "range / recipient. The transaction table shows timestamp, channel, recipient, event, "
         "status, latency, and provider message ID. Failed rows expand to reveal the failure reason "
         "and any retry attempts."),
    ]),
    ("Feature 17 - AI Chatbot", [
        ("Screen 1 - Launcher (Collapsed)",
         "Default state - a floating circular button (FAB) in the bottom-right corner of any page. "
         "A black filled circle with a lightning glyph in white. A small badge shows the count of "
         "suggested prompts queued for the user (e.g., 'try asking about your overdue follow-ups'). "
         "A black tooltip on hover reads 'Ask AGAPE assistant.' The launcher is available system-wide "
         "so officers can ask questions from any module."),
        ("Screen 2 - Conversation",
         "The chatbot panel open in an active conversation. A right-side panel (~540 wide) with a "
         "black header strip, a history sidebar listing prior sessions, and the main scrollable "
         "message stream. Messages alternate between user (right-aligned, filled black) and "
         "assistant (left-aligned, outlined). A tool-call card and a streamed email-draft preview "
         "appear inline within the assistant's responses. A sticky composer at the bottom has a "
         "dashed input + attach / mention / send buttons."),
        ("Screen 3 - Tool Call Detail",
         "Expanded reasoning trace for the assistant's latest answer. Numbered steps - thought, "
         "tool call (with args + result), thought, tool call, thought - showing exactly how the "
         "assistant produced the answer. Used for transparency and debugging. Each tool call shows "
         "the tool name, the inputs, the structured result, and the latency. Officers can review "
         "this when they need to verify the assistant's data sources before quoting them externally."),
        ("Screen 4 - Confirm Action",
         "Modal that appears whenever the assistant wants to take a write action (e.g., create a "
         "reminder, send an email draft, log an indicator). Shows the proposed action name, "
         "parameters as a labeled list, an audit-log preview, and an 'Edit parameters' link so the "
         "officer can adjust before approving. Three buttons - <b>Deny</b>, <b>Dry-run only</b>, "
         "<b>Approve &amp; run</b>. A 'trust this action type for 24h' opt-in skips future confirms "
         "for that action category."),
        ("Screen 5 - Citations",
         "Assistant's answer with inline footnote citations like <code>[1]</code> next to each "
         "factual claim. A right-side sources panel lists the five cited sources (database tables, "
         "forum threads, audit log entries) with open-in-new links so the officer can verify each "
         "claim against the actual record. A footer at the bottom of the answer shows the "
         "assistant's confidence level and data freshness timestamp."),
        ("Screen 6 - Error State",
         "Assistant ran into a problem. The card explains in plain language which parts succeeded "
         "and which failed (e.g., 'one tool timed out, another query failed because a migration "
         "hasn't run yet'). Offers a partial answer and recovery actions (Retry, Try fallback "
         "approach, Open admin to run migration). Includes a dev-only error log for the team to "
         "diagnose later."),
        ("Screen 7 - Context Attach",
         "Manager screen for the conversation's attached context items. The top section shows "
         "currently attached items as cards (page / dataset / file / forum thread). A library "
         "browser below lets the officer attach more items by category (programs, partnerships, "
         "donors, surveys, reports, stories, activity logs). A previewer pane on the right shows "
         "the contents of whatever is highlighted in the library."),
        ("Screen 8 - Settings",
         "Per-user assistant settings page. Left sub-nav - Behavior / Tools &amp; permissions / "
         "Memory / Voice &amp; language / Cost &amp; quota / Privacy. The Behavior tab covers "
         "response style (concise / balanced / detailed), default tone, scope (which data the AI "
         "sees by default), proactive-suggestions toggles, action-confirmation default, and a "
         "free-text 'system prompt addendum' field for advanced users."),
        ("Screen 9 - History",
         "Full conversation history list. A pinned section at the top, then a recent list. Each "
         "card shows the conversation title, the last assistant message snippet, the message count, "
         "and the relative timestamp. Per-row Continue / Export / Pin / Delete actions. A search "
         "field across all conversations helps the officer find a specific past chat when they "
         "remember the topic but not the date."),
    ]),
    ("Feature 18 - Profile", [
        ("Screen 1 - Overview",
         "Profile module landing page. The left sub-nav has all profile sections. The top header "
         "shows the avatar, name, role, MFA / verified badges, and Edit / Change-photo actions. "
         "KPI cards underneath show programs led, hours coordinated, reports authored, and "
         "approvals pending. A 'Current week' schedule card and a recent-activity list round out "
         "the page, giving the officer a personal at-a-glance view of their work."),
        ("Screen 2 - Personal Info",
         "Form covering the officer's name, display name (used in mentions), pronouns, bio, contact "
         "details (email / phone / office), languages, skill tags, and a visibility radio (everyone "
         "in the system / staff only / me only). This profile is what teammates see in mentions and "
         "in the people directory. Skill tags are used by program leads when picking volunteers or "
         "co-leads for new programs."),
        ("Screen 3 - Account &amp; Security",
         "Section with separate cards for Email, Phone, Password, MFA, and SSO - each with its own "
         "Change/Manage action. The MFA card lists what's enabled (authenticator app, SMS backup, "
         "recovery codes count) so the officer can see at a glance whether they have a second "
         "factor. A highlighted 'Danger zone' card at the bottom holds two destructive options - "
         "Suspend my account and Request data export."),
        ("Screen 4 - Change Password",
         "Modal with current / new / confirm password fields plus a real-time strength meter. A "
         "live checklist validates length, character mix, not-recently-used, not-in-breach "
         "(HaveIBeenPwned API), and confirm-match. On save, the system signs the user out of all "
         "other devices as a security precaution and sends a confirmation email."),
        ("Screen 5 - MFA Setup",
         "3-step wizard for pairing an authenticator app. Step 2 is shown here - a large QR code on "
         "the left, a manually-pastable secret string underneath, step-by-step instructions on the "
         "right, and a 6-digit confirmation input where the user types the code from their app to "
         "verify pairing worked. A 'can't scan - send SMS code instead' link offers an "
         "accessibility fallback."),
        ("Screen 6 - Role &amp; Assignments",
         "A read-only role banner up top with the user's role, scope explanation, and a "
         "Request-role-change CTA (which routes to admin). Below, cards for each assigned barangay "
         "(captain, active programs, pending needs), a table of programs the officer leads with "
         "status and SDG tags, and a role history list documenting every role transition with "
         "timestamps."),
        ("Screen 7 - Devices &amp; Sessions",
         "A list of every active session - the current session is highlighted in a "
         "thicker-bordered card. Other trusted devices have an End-session action. Suspicious "
         "sessions (failed MFA attempts, unusual locations) get a thicker-bordered alert card with "
         "'This wasn't me - secure account' as the primary action, which kills all sessions and "
         "forces a password reset. The bottom shows recent sign-in history with anomalies "
         "emphasized."),
        ("Screen 8 - Activity Log",
         "Chronological audit log of everything the user has done in AGAPE. A KPI strip (events "
         "last 30 days / top module / AI uses / write actions / approvals signed) up top, then a "
         "filterable transaction table with timestamp, module, action, subject, and status. Used "
         "by the officer to remember what they did when, and by admins for compliance audits. "
         "<b>[ Export CSV ]</b> in the header."),
        ("Screen 9 - Notification Preferences",
         "The same surface as Feature 16 Screen 4 but accessed from inside the profile - delivery "
         "channel cards (in-app / email / SMS / Messenger), per-event routing matrix, and quiet "
         "hours configuration. Stored per-user so each officer can tune their alert mix. "
         "Disaster-tagged events are force-on and cannot be muted, per safety policy."),
        ("Screen 10 - Sign Out Confirm",
         "Destructive confirm before signing out. Two radio options - 'this device only' (default; "
         "leaves other devices signed in) or 'everywhere' (kills all sessions, useful if a device "
         "is lost or compromised). A bordered warning block lists pending approvals and unsent "
         "drafts the officer might want to handle before leaving, with a 'Handle these first' "
         "shortcut. Cancel and Sign Out buttons in the footer."),
    ]),
]

# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

OUTPUT = "AGAPE_PARAYA_Officer_Screen_Descriptions.pdf"

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "Title", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=22, leading=26,
    spaceAfter=8, alignment=TA_LEFT,
)
subtitle_style = ParagraphStyle(
    "Subtitle", parent=styles["Normal"],
    fontName="Helvetica-Oblique", fontSize=11, leading=14,
    textColor=colors.black, spaceAfter=18,
)
feature_style = ParagraphStyle(
    "Feature", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=16, leading=20,
    spaceBefore=18, spaceAfter=10, textColor=colors.black,
)
screen_style = ParagraphStyle(
    "Screen", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=12, leading=15,
    spaceBefore=10, spaceAfter=4, textColor=colors.black,
)
body_style = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=10.5, leading=15,
    spaceAfter=10, textColor=colors.black, alignment=TA_LEFT,
)

doc = SimpleDocTemplate(
    OUTPUT, pagesize=LETTER,
    leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    title="AGAPE / PARAYA - Officer Screen Descriptions",
    author="PARAYA Office, DYCI Bocaue",
)

story = []
story.append(Paragraph("AGAPE / PARAYA", title_style))
story.append(Paragraph(
    "Officer Wireframe - Screen Descriptions<br/>"
    "One short paragraph per screen. Loading and empty states omitted.",
    subtitle_style,
))

for feature_title, screens in FEATURES:
    story.append(Paragraph(feature_title, feature_style))
    for screen_label, paragraph in screens:
        # Keep the screen label and its paragraph together to avoid orphaned headings
        block = [
            Paragraph(screen_label, screen_style),
            Paragraph(paragraph, body_style),
        ]
        story.append(KeepTogether(block))

doc.build(story)
print(f"Wrote: {OUTPUT}")
