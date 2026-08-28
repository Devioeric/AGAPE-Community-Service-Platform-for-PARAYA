# AGAPE Scope Baseline

## Requirements precedence

This file is the canonical requirements baseline for AGAPE development.

1. The **Current Approved Scope** below is authoritative.
2. **Confirmed** requirements in the detailed decision register override **Default adopted** requirements.
3. A **Needs confirmation** item must remain flagged and must not become a final architectural assumption without stakeholder confirmation.
4. If the current approved scope explicitly resolves an older uncertainty, the current approved scope takes precedence.

---

# Current Approved Scope

This study covers the design and development of AGAPE: A System for Community Needs Assessment and Engagement Platform, a web-based platform intended to support the community engagement and extension activities of the PARAYA Office of Dr. Yanga’s Colleges, Inc. The system will centralize community profiling and needs assessment, partnership management, project proposal and approval, budget monitoring, volunteer management, program tracking, donation and resource management, analytics, reporting, impact measurement, communication, and system administration. It will also use Artificial Intelligence (AI) to assist PARAYA in analyzing community information, identifying priority and unaddressed needs, recommending possible interventions, assessing project alignment, and generating narrative reports. AI-generated outputs will remain advisory and subject to validation and decision-making by authorized personnel.

The authorized users of AGAPE will consist of the PARAYA Director, PARAYA Associate, PARAYA Researcher, Finance Officer, Barangay Captain, Barangay Secretary, Barangay Mother Leader, DYCI Student Volunteers, and System Administrator. DYCI Offices, Student Organizations, Academic Departments, external organizations, and other project proponents will remain represented within the system as Partner or Proponent records, with authorized PARAYA personnel managing their proposals and related program information.

## Login and Authentication Module

The Login and Authentication Module will provide secure access to registered users based on their assigned roles. It will manage account authentication, user sessions, password recovery, and role-based access restrictions to ensure that users can only access information and functions appropriate to their responsibilities.

## Dashboard Module

The Dashboard Module will provide role-specific summaries of programs, proposals, partnerships, profiling activities, community needs, volunteer participation, budgets, reports, and other relevant system information. Authorized PARAYA personnel may also receive AI-assisted recommendations and alerts concerning priority or unaddressed community needs, while other users will view information relevant to their specific responsibilities.

## User Management Module

The User Management Module will manage the accounts, roles, permissions, and account statuses of the PARAYA Director, Associate, Researcher, Finance Officer, Barangay Captain, Barangay Secretary, Barangay Mother Leader, DYCI Student Volunteers, and System Administrator. DYCI Offices, Student Organizations, Academic Departments, and other organizations will be maintained as Partner or Proponent records rather than separate user accounts, while authorized PARAYA personnel may encode proposals and related information on their behalf.

## System Administration and Backup Module

The System Administration and Backup Module will allow the System Administrator to manage user accounts, permissions, system settings, audit logs, database status, AI service configuration, backup, restoration, and the technical configuration required for blockchain-supported integrity verification. Administrative access to resident-level profiling information will be restricted unless required for an authorized technical or recovery purpose.

## Partnership Management Module

The Partnership Management Module will maintain information concerning partner barangays, DYCI units, Student Organizations, Academic Departments, external organizations, and other community partners. Records may include contact persons, agreements, partnership duration, status, implemented programs, beneficiaries, volunteer participation, resources, budgets, and identified or remaining community needs. The module will also retain available historical programs associated with each partner and may provide partnership-renewal reminders and AI-assisted recommendations based on previous activities and remaining community needs.

## Project Proposal and Approval Workflow Module

The Project Proposal and Approval Workflow Module will allow authorized PARAYA personnel to encode, submit, review, revise, and approve community engagement proposals. Proposals may contain the project title, identified community need, target barangay or sitio, beneficiary category, estimated beneficiary count, implementation period, SDG alignment, resources, and proposed budget. The system may estimate beneficiary counts from approved profiling data and provide AI-assisted suggestions for project titles, beneficiaries, possible interventions, SDGs, and project alignment. Automated validation may identify incomplete information or alignment concerns, but the system will not automatically reject proposals. Financial review, revision, approval, and rejection will remain human-controlled, with final approval or rejection performed by the PARAYA Director. Finalized approved proposals may also use blockchain-supported cryptographic verification to provide tamper-evident proof of the approved record without storing complete documents or personal information on the blockchain.

## Community Needs Assessment and Barangay Profiling Module

The Community Needs Assessment and Barangay Profiling Module will support household- and resident-level profiling within selected households. Profiling during the capstone will use sampled households rather than function as a complete barangay census, while the usual residents of selected households may be included subject to appropriate consent and data-collection procedures. Profiling may contain necessary demographic, socioeconomic, educational, employment, household-condition, skills, vulnerability, asset, and community-needs information while excluding unnecessary sensitive information such as government identification numbers, biometric information, exact household GPS coordinates, and detailed medical records. Barangay Mother Leaders may manually encode or upload profiling data through structured CSV or XLSX templates within their assigned sitios or puroks, while the Barangay Secretary will validate the submitted information before it becomes approved system data. Official barangay population and household figures will be presented separately from sample-derived AGAPE profiling totals.

## Volunteer Management Module

The Volunteer Management Module will manage volunteer registration, program participation, skills, availability, schedules, assignments, attendance, activities, and service hours. Volunteer matching will consider eligibility, skill suitability, schedule availability, and proximity to the program location, with skill and availability given greater priority than distance. Volunteers may provide an approximate location with consent, but exact home locations and continuous location tracking will not be required. Authorized users may also generate secure invitation links allowing eligible volunteers to register or join specific programs subject to program capacity, eligibility, expiration, and other requirements.

## Skill and Asset Documentation Module

The Skill and Asset Documentation Module will document available community skills, capabilities, and resources that may support community projects. Information may be contributed through profiling and needs-assessment activities by the PARAYA Researcher and authorized Barangay Mother Leaders and may be summarized at barangay or sitio level for use in project planning and AI-assisted recommendations.

## Program Tracking and Monitoring Module

The Program Tracking and Monitoring Module will monitor approved programs throughout their implementation and may record activities, schedules, milestones, volunteers, beneficiaries, attendance, service hours, reports, supporting documentation, budgets, and program outcomes. The module will also maintain available records of programs implemented before AGAPE, allowing authorized PARAYA personnel to encode historical programs from existing digital or paper-based records. Historical information may be classified according to its completeness and reliability and may be used in analytics and AI recommendations with appropriate data-quality limitations.

## Budget and Financial Monitoring

The Budget and Financial Monitoring function will expand the existing financial review process by allowing project proposals to contain categorized budget items, estimated costs, funding sources, and in-kind resources. The Finance Officer may clear a proposed budget or return it for revision without directly modifying the proposer’s figures. During implementation, the system may record actual expenditures, supporting documents, liquidation-related evidence, budget revisions, variance, and remaining balances. Finalized finance-cleared budget summaries may use blockchain-supported cryptographic verification to provide tamper-evident validation. AGAPE will monitor and document project finances but will not process payments or replace the official accounting system of Dr. Yanga’s Colleges, Inc.

## Donation and Resource Management Module

The Donation and Resource Management Module will maintain information concerning goods, equipment, materials, monetary contributions, and other resources received or distributed for community engagement activities. Records may include donor information, resource type, quantity or amount, associated program, date received, availability, allocation, and distribution and may be linked to partnerships, programs, budgets, analytics, and reports.

## Analytics Module

The Analytics Module will consolidate approved profiling, needs assessment, program, partnership, volunteer, budget, donation, and impact information through statistical summaries, visualizations, and comparative analysis. The module will incorporate AI-assisted recommendations using aggregated or de-identified data to identify priority needs, target beneficiaries, possible projects, relevant SDGs, indicative resources, estimated budget ranges, and volunteer requirements. Recommendations will be supported by system-derived statistics or evidence. The system will also automatically detect approved high-priority community needs that do not have sufficient planned, active, or relevant previous programs and generate advisory recommendations for PARAYA. This automation will not automatically create, submit, approve, or reject project proposals.

## Reporting Module

The Reporting Module will generate structured reports concerning community profiling, identified needs, programs, volunteers, partnerships, historical activities, donations, budgets, SDG contributions, and impact measurement. Reports based on sampled profiling data will identify their corresponding profiling cycle, sample size, and coverage. Reports may be prepared according to authorized reporting periods and may be exported in PDF or Excel formats. Selected finalized program and impact reports may also use blockchain-supported cryptographic verification to provide tamper-evident proof that the finalized version has not been altered.

## AI Narrative Report Feature

The AI Narrative Report Feature will assist in transforming approved and de-identified system analytics into readable narrative drafts concerning community profiles, needs, program performance, volunteer participation, partnerships, resources, budgets, SDG contributions, and impact findings. AI-generated narratives will remain subject to human review and validation before being used for official reporting or decision-making.

## Conversational AI Chatbot

The Conversational AI Chatbot will provide role-appropriate assistance concerning programs, schedules, assignments, requirements, profiling procedures, community-needs submissions, partnerships, and other authorized system information. Chatbot responses will depend on the user’s role and permissions and will not provide unauthorized resident-level information or make official approval, rejection, or financial-clearance decisions.

## Impact Measurement Module

The Impact Measurement Module will evaluate community engagement activities through quantitative and qualitative indicators. Quantitative information may include beneficiaries reached, volunteer service hours, activities conducted, materials distributed, and other measurable program outputs, while qualitative information may include feedback, observations, personal stories, case studies, and before-and-after narratives. Impact information may be linked to identified community needs, beneficiaries, SDGs, partnerships, previous programs, and implemented interventions to assist PARAYA in evaluating whether community needs remain unaddressed, partially addressed, or addressed.

## Communication Module

The Communication Module will support coordination among PARAYA personnel, Barangay Officials, DYCI Student Volunteers, the Finance Officer, and other relevant stakeholders through available in-app, email, and SMS notifications. Notifications may include program announcements, volunteer assignments, proposal updates, financial-review notices, profiling activities, partnership reminders, and AI recommendation alerts. Partner or Proponent organizations without system accounts may receive relevant proposal or program updates through their recorded contact information.

AGAPE will be developed as a responsive, internet-dependent web-based platform accessible through desktop computers, laptops, tablets, and mobile web browsers. The system will be designed to support multiple partner barangays; however, Biñang 2nd will serve as the primary pilot barangay for resident-level profiling during the capstone implementation, unless additional barangays are formally authorized and prepared to participate.

---

# Detailed Requirements Decision Register

## Instructions for the next AI

Use this document as the working requirements baseline for the AGAPE Community Service Platform for PARAYA. It combines:

1. The complete clarification questionnaire previously raised for resident profiling, AI recommendations, proposals, budgets, partnerships, volunteers, blockchain, administration, and barangay deployment.
2. The answers subsequently supplied by the project team.
3. Recommended defaults for every question answered with “Default,” left blank, answered uncertainly, or not answered.

Interpretation labels:

- **Confirmed** — explicitly answered by the project team or directly stated by the panel/client.
- **Default adopted** — not explicitly decided; use the recommended answer for scope planning until the panel overrides it.
- **Needs confirmation** — retained only where a decision is too consequential to safely present as confirmed. A proposed default is still supplied so design work can continue.

When confirmed and default requirements conflict, the confirmed answer takes precedence. AI outputs are advisory. No AI process may automatically submit, approve, or reject a proposal.

---

## Panel revisions that drive the scope

### Sir Edgar

- Integrate AI recommendations into Analytics.
- Add profiling-based AI suggestions.
- Expand Partnership Management.
- Show total population and households.
- Help determine which projects should be submitted.
- Add controlled beneficiary, beneficiary-count, project-title, and SDG assistance.
- Add AI implementation/alignment assessment.
- Automate detection of profile-based needs without a corresponding project.
- Allow Mother Leaders to upload profiling data.
- Change barangay profiling to resident-level profiling with detailed records.

### Sir Espino Jr.

- Find volunteers closest to the program perimeter.
- Add invitation links that allow other volunteers to join a program.
- Reduce the number of account types.
- Remove automatic proposal rejection.

### Sir Paul

- Expand Budget functionality.
- Include programs that existed before AGAPE was implemented.
- Add a blockchain implementation.

### Confirmed login roles

- PARAYA Director
- PARAYA Associate
- PARAYA Researcher
- Barangay Captain
- Barangay Secretary
- Mother Leader
- Volunteer
- System Administrator
- Finance Officer

**Confirmed by the current approved scope:** Office, Student Organization, Department, external organization, and other proponents are **non-login Partner/Proponent records**, not user-account roles.

---

# A. Resident-Level and Household Profiling

## A1. Coverage and identity

1. **Does every resident of a partner barangay need an individual record?**  
   **Confirmed:** No. Only residents belonging to households selected for profiling receive individual records.

2. **Does resident-level profiling mean every person in every selected household?**  
   **Confirmed:** Yes. Once a household is selected, every usual resident/member of that household is represented in the household roster, subject to consent and lawful data-collection rules.

3. **Will all households be profiled or only sampled households?**  
   **Confirmed:** Only a sample will be profiled during the capstone.

4. **How is a sampled household distinguished from the barangay's complete population?**  
   **Default adopted:** Each profiling cycle records its barangay, sitios covered, sampling method, target sample, completed households, response rate, date range, and status. All reports label results as “profiled sample” and never present them as a complete census.

5. **Will each household have a unique Household ID?**  
   **Default adopted:** Yes. Each household has an immutable system UUID and a readable barangay-scoped Household Code.

6. **Will each resident have a unique Resident ID?**  
   **Default adopted:** Yes. Each resident has an immutable system UUID and a readable Resident Code. IDs are not reused after transfer, death, or deactivation.

7. **Does the barangay already possess an official resident database that can be imported?**  
   **Default adopted:** AGAPE does not depend on a direct integration with an existing barangay database. If a lawful official spreadsheet is available, it may be imported through the same validated CSV/XLSX process. Otherwise, Mother Leaders create the records using the profiling form/template.

8. **Will Mother Leaders create the records from scratch?**  
   **Default adopted:** Yes, through manual forms or structured CSV/XLSX import, with Secretary validation before records become approved profiling data.

## A2. Meaning of “every detail” and required data

9. **What does “every detail” mean?**  
   **Default adopted:** It means the minimum detailed information needed for demographic, socioeconomic, education, health-vulnerability, infrastructure, and needs analysis—not unrestricted collection of all possible personal data.

10. **Name?**  
    **Default adopted:** Yes, full legal/preferred name for local record matching. Names are excluded from AI inputs.

11. **Birthday?**  
    **Default adopted:** Yes, date of birth where known. If unknown, an estimated birth year/age may be recorded and flagged as estimated.

12. **Age?**  
    **Default adopted:** Calculated from date of birth; stored only as a fallback when the birth date is unknown.

13. **Sex?**  
    **Default adopted:** Yes, using a controlled option set and “Prefer not to say/Not reported.”

14. **Civil status?**  
    **Default adopted:** Yes, for residents for whom it is applicable.

15. **Address?**  
    **Default adopted:** Household-level address/landmark and sitio/purok, not a separate full address for every resident.

16. **Sitio/Purok?**  
    **Default adopted:** Yes, required at household level and used for Mother Leader access control.

17. **Household relationship?**  
    **Default adopted:** Yes: household head, spouse/partner, child, parent, sibling, relative, non-relative, or other.

18. **Educational attainment?**  
    **Default adopted:** Yes.

19. **Current school?**  
    **Default adopted:** Optional for enrolled residents; collect school name/type only when relevant to educational planning.

20. **Employment status?**  
    **Default adopted:** Yes, using controlled categories.

21. **Occupation?**  
    **Default adopted:** Optional free text or standardized occupation category.

22. **Individual income?**  
    **Default adopted:** Do not collect exact individual income. Use an optional income bracket or employment category only when necessary.

23. **Household income?**  
    **Default adopted:** Yes, as a bracket rather than an exact amount.

24. **Skills?**  
    **Default adopted:** Yes, as controlled skill categories with optional notes, primarily for livelihood and community-capacity planning.

25. **Disability?**  
    **Default adopted:** Yes, as a voluntary PWD/vulnerability indicator and broad support category. Do not collect government disability ID numbers.

26. **Health conditions?**  
    **Default adopted:** Only broad health vulnerability/condition categories needed for planning. Avoid detailed diagnoses, clinical notes, medical documents, and treatment history.

27. **Pregnancy status?**  
    **Default adopted:** Optional, sensitive, time-limited, consent-based, and visible only to roles authorized for profiling/needs work.

28. **Senior citizen status?**  
    **Default adopted:** Derived from date of birth/age, with an optional confirmation flag.

29. **Solo-parent status?**  
    **Default adopted:** Yes, as an optional vulnerability indicator. Do not store the Solo Parent ID number.

30. **4Ps membership?**  
    **Default adopted:** Yes/no/prefer not to say. Do not store program ID numbers.

31. **Internet access?**  
    **Default adopted:** Yes, at household level.

32. **Device ownership?**  
    **Default adopted:** Yes, at household level using device categories.

33. **Water source?**  
    **Default adopted:** Yes, at household level.

34. **Electricity?**  
    **Default adopted:** Yes, at household level.

35. **Toilet/sanitation?**  
    **Default adopted:** Yes, at household level.

36. **Housing condition?**  
    **Default adopted:** Yes, as tenure, material/condition category, and safety indicators—not photographs by default.

37. **Disaster vulnerability?**  
    **Default adopted:** Yes, including hazards, previous exposure, evacuation needs, and broad vulnerability indicators.

38. **Livelihood needs?**  
    **Default adopted:** Yes, at resident or household level as applicable.

39. **Educational needs?**  
    **Default adopted:** Yes.

40. **Health needs?**  
    **Default adopted:** Yes, using planning categories rather than clinical records.

## A3. Sensitive and location data

41. **Do you need exact home addresses?**  
    **Default adopted:** No exact address is required for analytics. Store sitio/purok plus an optional household landmark or local address only when operationally necessary.

42. **Do you need coordinates of households?**  
    **Default adopted:** No exact household GPS coordinates. Barangay/sitio centroids or deliberately approximate coordinates may be used for maps.

43. **Do you need resident photographs?**  
    **Default adopted:** No.

44. **Do you need government ID numbers?**  
    **Default adopted:** No. Do not collect national ID, 4Ps ID, senior ID, PWD ID, voter ID, or similar numbers.

45. **Do you need contact numbers?**  
    **Default adopted:** One optional household primary contact number may be stored with consent. Do not require a number for every resident.

46. **Do you need email addresses?**  
    **Default adopted:** No resident email is required. An optional household contact email may be collected only when necessary and consented to.

47. **Which sensitive fields are prohibited?**  
    **Confirmed/default clarified:** Government ID numbers, resident photographs, biometric data, exact GPS coordinates, account passwords, detailed medical records/diagnoses, and unnecessary exact financial information are prohibited. AI must not receive names, contact data, IDs, or exact addresses.

## A4. Authority, privacy, and access

48. **Who is legally and operationally authorized to collect these details?**  
    **Default adopted:** Authorized Mother Leaders, Barangay Secretary, and PARAYA Researcher or trained data collectors acting under the barangay/PARAYA-approved profiling activity. Collection must follow the Philippine Data Privacy Act, an approved privacy notice, consent procedure, and institutional/barangay authorization.

49. **Who may view individual resident profiles?**  
    **Default adopted:** Mother Leader for assigned sitio only; Secretary and Captain for their barangay; PARAYA Researcher across participating barangays for validation and analysis; System Administrator has no ordinary content-viewing interface. Director and Associate receive aggregates by default, with exceptional identifiable access requiring a documented purpose and audit entry.

50. **Can the Mother Leader view all residents in her sitio only?**  
    **Confirmed:** Yes.

51. **Can the Secretary view all residents in the barangay?**  
    **Default adopted:** Yes, including pending imports requiring validation.

52. **Can the Captain view everything?**  
    **Default adopted:** The Captain can view approved resident/household records within the Captain's barangay and necessary approval summaries, but not other barangays or hidden system credentials/configuration.

53. **Can the PARAYA Researcher see personally identifiable resident information?**  
    **Default adopted:** Yes, when needed for data validation, correction, deduplication, and authorized research operations. Access is logged.

54. **Should the PARAYA Director see individual records or only aggregated analytics?**  
    **Default adopted:** Aggregated analytics by default. Exceptional resident-level access requires a documented operational purpose and is audited.

55. **Should the PARAYA Associate see individual records or only aggregated analytics?**  
    **Default adopted:** Aggregated analytics by default, with the same exceptional audited-access rule as the Director.

56. **Should AI ever receive names and identifiable information?**  
    **Confirmed:** No. AI receives only aggregated or de-identified data.

57. **Can households refuse profiling?**  
    **Default adopted:** Yes. Refusal does not affect eligibility for ordinary barangay or PARAYA services. Store only a minimal non-response/refusal status if needed for sampling statistics.

58. **Will informed consent/privacy notice be included?**  
    **Confirmed:** Yes.

## A5. Updates and resident lifecycle

59. **How frequently should profiles be updated?**  
    **Default adopted:** At least twice a year per profiling cycle, with corrections or lifecycle updates allowed when reported.

60. **Does the system maintain historical versions when resident information changes?**  
    **Default adopted:** Yes. Keep a version/change history showing who changed what and when. Do not overwrite important historical values without traceability.

61. **What happens when someone moves out?**  
    **Default adopted:** Mark the resident inactive/moved out with an effective date and destination category if voluntarily provided. Exclude the person from current population totals but retain historical records.

62. **What happens when someone dies?**  
    **Default adopted:** Mark deceased with an effective date. Exclude from current totals and restrict the record from routine editing; do not hard-delete it.

63. **What happens when a resident transfers households?**  
    **Default adopted:** End the old household-membership period and create a new membership link to the receiving household while retaining the same Resident ID.

64. **What happens when a new child or resident joins a household?**  
    **Default adopted:** Create a new resident record or link an existing resident to the household, with effective date and validation.

65. **What happens when a household dissolves or permanently moves?**  
    **Default adopted:** Deactivate/archive the household with an effective date; retain its members' and profiling history.

---

# 22. Mother Leader Questions

1. **Will each Mother Leader have her own account?**  
   **Default adopted:** Yes. Accounts must not be shared.

2. **How many Mother Leaders are there per barangay?**  
   **Default adopted:** Multiple are supported; the actual number is configured per barangay rather than hard-coded.

3. **Is one Mother Leader assigned to one sitio/purok?**  
   **Default adopted:** Each Mother Leader is assigned to one or more explicit sitios/puroks. Access follows these assignments.

4. **Can a Mother Leader create households?**  
   **Default adopted:** Yes, within assigned sitios. New records remain pending until Secretary validation.

5. **Can she edit existing households?**  
   **Default adopted:** Yes, within assigned sitios. Material changes create a pending revision/version requiring Secretary validation.

6. **Can she create individual resident records?**  
   **Default adopted:** Yes, within assigned households/sitios, subject to consent and Secretary validation.

7. **Can she delete records?**  
   **Default adopted:** No hard deletion. She may request deactivation, duplicate merge, or correction.

8. **Should deletion require Secretary approval?**  
   **Default adopted:** Yes. Deactivation or duplicate resolution requires Secretary approval; permanent deletion is restricted to exceptional privacy/legal cases.

9. **Does the Captain approve profiling entries?**  
   **Default adopted:** No routine record-by-record approval. The Secretary validates profiling records; the Captain approves community-needs submissions and may approve the completion of a barangay profiling cycle.

10. **Does the Captain approve only community-needs submissions?**  
    **Default adopted:** Primarily yes, plus optional cycle-level endorsement—not each resident record.

11. **Can Mother Leaders upload Excel?**  
    **Confirmed:** Yes, XLSX.

12. **Can Mother Leaders upload CSV?**  
    **Confirmed:** Yes.

13. **Can Mother Leaders upload PDF?**  
    **Default adopted:** Not as a structured import. PDFs may be attached as supporting evidence only if required.

14. **Can Mother Leaders upload scanned profiling sheets?**  
    **Default adopted:** Optional supporting attachment only; the initial scope excludes automatic OCR/data extraction.

15. **Can Mother Leaders upload photographs of forms?**  
    **Default adopted:** Optional supporting attachment only, subject to privacy controls. Avoid attachments containing prohibited IDs or unnecessary sensitive information.

16. **Does “uploading data” mean bulk spreadsheet import or actual document upload?**  
    **Confirmed:** Structured CSV/XLSX bulk import is the main requirement.

17. **What spreadsheet template must be followed?**  
    **Default adopted:** A fixed, versioned AGAPE template with separate Household and Resident sheets (or linked CSV files), stable field codes, Household Code linkage, required-column validation, controlled dropdown values, and a downloadable sample/template.

18. **Should imported records be validated by the Barangay Secretary first?**  
    **Confirmed:** Yes. Imports remain pending until Secretary validation.

19. **Who resolves duplicate households or residents?**  
    **Default adopted:** The system flags probable duplicates using household code, names, birth dates, address/sitio, and household membership. The Secretary resolves them; the Researcher handles cross-barangay or ambiguous cases. No automatic merge occurs.

20. **Should Mother Leaders see only their own sitio's records?**  
    **Confirmed:** Yes.

---

# 23. Population and Household Questions

1. **Should Total Population be automatically calculated from resident records?**  
   **Default adopted:** Yes, but label it “Approved profiled residents” because the capstone uses a sample.

2. **Should Total Households be calculated from household records?**  
   **Default adopted:** Yes, using approved active profiled households.

3. **Should official barangay totals and system-calculated profiling totals both be displayed?**  
   **Confirmed:** Yes.

4. **Which total is authoritative?**  
   **Default adopted:** The barangay-supplied official population/household total is authoritative for official census reporting. AGAPE's calculated total is authoritative only for the approved profiled sample. Both show source and “as of” date.

5. **Should pending residents count?**  
   **Confirmed:** No.

6. **Should inactive, moved-out, or deceased residents count?**  
   **Confirmed:** No.

7. **Do you need male/female counts?**  
   **Default adopted:** Yes, including not reported/prefer not to say where applicable.

8. **Do you need age-group counts?**  
   **Default adopted:** Yes.

9. **Children?**  
   **Default adopted:** Yes, ages 0–14.

10. **Youth?**  
    **Default adopted:** Yes, using the institution-approved youth definition; default 15–30.

11. **Working age?**  
    **Default adopted:** Yes, default 15–64.

12. **Senior citizens?**  
    **Default adopted:** Yes, age 60+.

13. **PWD?**  
    **Default adopted:** Yes, as an aggregate count/percentage.

14. **Students?**  
    **Default adopted:** Yes, enrolled/not enrolled among school-age residents.

15. **Employed/unemployed?**  
    **Default adopted:** Yes, with not-in-labor-force and not reported categories.

16. **Income brackets?**  
    **Default adopted:** Yes, primarily household-income brackets.

17. **Households per sitio?**  
    **Default adopted:** Yes.

18. **Population per sitio?**  
    **Default adopted:** Yes, for approved profiled residents and clearly labeled as sample-derived.

19. **Household size?**  
    **Default adopted:** Yes, total and average.

20. **Dependency ratio?**  
    **Default adopted:** Yes, calculated from the adopted age groups and labeled as sample-derived.

21. **Do you need year-to-year population comparisons?**  
    **Default adopted:** Yes, when at least two approved profiling cycles or official snapshots exist.

22. **What other population breakdowns are required?**  
    **Default adopted:** Sex, age group, sitio, education, school enrollment, employment, senior, PWD, solo parent, pregnancy vulnerability, 4Ps, household income, internet/device access, and primary needs—all displayed only where sample size/privacy thresholds are met.

---

# 24. AI Profiling Questions

1. **What exactly should AI suggest?**  
   **Default adopted:** Detected community problems/needs, priority/urgency, affected population, alternative programs, target beneficiaries, appropriate SDGs, resources, indicative budget range, and estimated volunteers.

2. **Community problems?**  
   **Default adopted:** Yes.

3. **Priority needs?**  
   **Default adopted:** Yes.

4. **Possible programs?**  
   **Default adopted:** Yes, normally up to three alternatives.

5. **Target beneficiaries?**  
   **Default adopted:** Yes, using controlled resident-profile categories.

6. **Appropriate SDGs?**  
   **Default adopted:** Yes; the Researcher confirms the final SDGs.

7. **Recommended program urgency?**  
   **Default adopted:** Yes: Critical, High, Medium, or Low with an explanation.

8. **Required resources?**  
   **Default adopted:** Yes, as indicative categories/quantities.

9. **Budget estimates?**  
   **Default adopted:** Yes, as non-binding ranges based on prior verified programs and configured cost assumptions.

10. **Appropriate number of volunteers?**  
    **Default adopted:** Yes, as an estimate based on beneficiaries, activity type, duration, eligibility, and prior programs.

11. **Should the AI explain why it recommended something?**  
    **Default adopted:** Yes.

12. **Should recommendations cite the actual profiling statistics that caused the recommendation?**  
    **Confirmed:** Yes. Every recommendation must show supporting statistics and source profiling cycle/records in de-identified form.

13. **Who approves AI recommendations?**  
    **Default adopted:** The PARAYA Researcher reviews data/evidence and may endorse a recommendation; the Director makes the final decision to convert it into or approve a proposal. The Associate may collaborate and comment.

14. **Can the Researcher dismiss recommendations?**  
    **Default adopted:** Yes.

15. **Should dismissal require a reason?**  
    **Default adopted:** Yes.

16. **Should dismissed recommendations be stored?**  
    **Confirmed:** Yes, with reason, actor, and timestamp.

17. **Should AI recommendations be regenerated when profiling data changes?**  
    **Default adopted:** Material data changes mark existing recommendations “stale.” Regeneration occurs on demand or after approval of a new profiling cycle, not after every individual edit.

18. **Should AI recommendations be generated automatically or only when someone clicks “Analyze”?**  
    **Default adopted:** Both: users may run analysis on demand, while a scheduled rule checks for unaddressed high/critical needs and creates recommendations. Automatic output remains a recommendation only.

19. **Should AI receive identifiable resident data?**  
    **Confirmed:** No. Only aggregate or de-identified data is sent.

20. **Should AI outputs be treated as final decisions?**  
    **Default adopted:** No. They are advisory decision-support artifacts requiring human review.

---

# 25. Project Recommendation Questions

1. **Should AI recommend completely new project titles or select from an approved PARAYA project catalog?**  
   **Default adopted:** AI may suggest an editable title. When an approved project catalog/template exists, it should prefer catalog matches but may suggest a new project where no suitable template exists.

2. **Do you already have standardized program categories?**  
   **Default adopted:** Use controlled categories such as Education, Health and Nutrition, Livelihood/Economic, Environment and Sanitation, Disaster Preparedness, Social Welfare, Technology/Digital Literacy, and Other. Administrators may maintain the list.

3. **Should the system look at previous programs before recommending new ones?**  
   **Default adopted:** Yes.

4. **How many years of previous programs should be considered?**  
   **Default adopted:** The most recent five years, with greater weight on recent and verified records.

5. **Should a previous unsuccessful program be recommended again?**  
   **Default adopted:** Only if the AI explains the previous outcome, identifies lessons learned, and proposes a materially revised approach. It must show a warning.

6. **How will the system determine whether a need is already addressed?**  
   **Default adopted:** Through explicit links between needs, recommendations, proposals, and programs, plus program status, target beneficiaries, coverage, dates, and outcome/follow-up evidence. A Researcher may confirm or correct the classification.

7. **Does an active project automatically mean the need is addressed?**  
   **Default adopted:** No. It means the need is being addressed; coverage may still be partial.

8. **What if one project partially addresses the need?**  
   **Default adopted:** Mark the need Partially Addressed and retain its remaining affected population/gap.

9. **Do you want a percentage such as “75% alignment”?**  
   **Default adopted:** Show an evidence-based estimated coverage percentage where data permits, but also show the underlying counts and confidence/limitations. Do not use a percentage as the sole decision.

10. **Who determines the threshold?**  
    **Default adopted:** PARAYA configures thresholds. Initial default: 0% Unaddressed, 1–79% Partially Addressed, 80–99% Substantially Addressed, and 100%/Researcher-confirmed Addressed.

11. **Should AI recommend more than one alternative project?**  
    **Default adopted:** Yes, up to three ranked alternatives.

12. **Should recommendations include priority ranking?**  
    **Default adopted:** Yes.

13. **High/Medium/Low?**  
    **Default adopted:** Use Critical, High, Medium, and Low to align with community-need urgency.

14. **Should recommendations be barangay-specific?**  
    **Default adopted:** Yes.

15. **Sitio-specific?**  
    **Default adopted:** Yes when the sample and privacy thresholds support it.

16. **Household-group-specific?**  
    **Default adopted:** Yes for de-identified beneficiary segments, never by exposing named residents to AI.

---

# 26. Automation Questions

1. **What does “without project to propose” precisely mean?**  
   **Default adopted:** An approved High or Critical need has no linked planned or active project providing sufficient coverage, after also checking relevant completed programs in the preceding 24 months.

2. **No active project?**  
   **Default adopted:** This is one condition, but planned and recent completed projects are also considered.

3. **No planned project?**  
   **Default adopted:** Planned projects count as “being addressed,” but their coverage and status are shown.

4. **No previous project?**  
   **Default adopted:** Previous projects inform the recommendation but do not automatically prevent a new recommendation.

5. **No project within the last year?**  
   **Default adopted:** Check the previous 24 months by default because outcomes and recurrence can extend beyond one year.

6. **Should the automation run daily, weekly, monthly, or whenever profiling changes?**  
   **Default adopted:** Weekly and whenever a profiling cycle is approved. Individual edits only mark relevant analysis as stale.

7. **Should it notify only the PARAYA Researcher?**  
   **Confirmed:** No.

8. **Researcher + Associate?**  
   **Confirmed:** Yes.

9. **Director too?**  
   **Default adopted:** The Director is notified only for Critical recommendations or recommendations endorsed by the Researcher, avoiding routine alert overload.

10. **Should the automation create a recommendation only or create a draft proposal?**  
    **Confirmed:** Recommendation only.

11. **Should it ever automatically submit a proposal?**  
    **Confirmed/default policy:** Never.

12. **How is a project linked to a community need?**  
    **Default adopted:** Through explicit many-to-many links from recommendations/proposals/programs to approved community needs, with coverage notes, target segments, and estimated beneficiary counts.

---

# 27. AI Alignment Questions

1. **Does alignment refer to community needs?**  
   **Default adopted:** Yes.

2. **SDGs?**  
   **Default adopted:** Yes.

3. **PARAYA mission?**  
   **Default adopted:** Yes.

4. **DYCI objectives?**  
   **Default adopted:** Yes.

5. **Available budget?**  
   **Default adopted:** Yes, as resource feasibility.

6. **Available volunteers?**  
   **Default adopted:** Yes, as capacity feasibility.

7. **Previous programs?**  
   **Default adopted:** Yes, including outcomes and record quality.

8. **Beneficiary appropriateness?**  
   **Default adopted:** Yes.

9. **All of these?**  
   **Default adopted:** Yes, but show them as separate explainable dimensions rather than hiding them in one score.

10. **Do you want a numeric alignment score?**  
    **Default adopted:** A numeric score may be retained internally for ranking, but the user-facing result shows dimension evidence and textual ratings.

11. **Or a textual result such as Strong/Moderate/Weak?**  
    **Default adopted:** Yes: Strong, Moderate, Weak, or Insufficient Evidence for each dimension, plus an overall “Recommended,” “Review Required,” or “Not Recommended” advisory result.

12. **Should AI alignment be advisory only?**  
    **Default adopted:** Yes. It may warn or require human review but must not automatically reject.

13. **Can PARAYA override a poor AI alignment result?**  
    **Default adopted:** Yes.

14. **Should the override be logged?**  
    **Default adopted:** Yes, with actor, reason, date, original result, and replacement decision.

---

# 28. Proposal Questions

1. **Who can create proposals if institutional-partner accounts are removed?**  
   **Confirmed:** All three PARAYA officers—Director, Associate, and Researcher—may encode proposals, including proposals originating from outside organizations.

2. **Can the Director create proposals?**  
   **Confirmed:** Yes.

3. **Can the Associate create proposals?**  
   **Confirmed:** Yes.

4. **Can the Researcher create proposals?**  
   **Confirmed:** Yes.

5. **Can a DYCI Office send a proposal externally that PARAYA then encodes?**  
   **Default adopted:** Yes, through official email/document intake; a PARAYA officer encodes it and records the originating organization.

6. **Do you still need to track the proposal's originating organization?**  
   **Default adopted:** Yes, as a non-login Partner/Proponent record with contact persons.

7. **Can proposals originate from barangay officials?**  
   **Default adopted:** Yes. Barangay officials submit/endorse needs or an external proposal document; PARAYA encodes the formal proposal.

8. **Can AI create proposal drafts?**  
   **Default adopted:** Yes, but only after a human chooses a recommendation and explicitly requests a draft. AI never submits it.

9. **Should proposal title be free text or suggested?**  
   **Default adopted:** AI-suggested and editable free text, with an optional approved-template/catalog selection.

10. **Should beneficiaries be selected from profile categories?**  
    **Confirmed:** Yes.

11. **Should beneficiary count be manually entered?**  
    **Default adopted:** It is initially estimated from approved profile filters.

12. **Or automatically estimated from resident data?**  
    **Confirmed:** Yes, from approved active records in the selected sample/coverage area.

13. **Can users override the estimated beneficiary count?**  
    **Confirmed:** Yes.

14. **Should override require a reason?**  
    **Default adopted:** Yes; store the calculated count, overridden count, reason, and actor.

15. **Should the proposal link to a specific identified need?**  
    **Default adopted:** Yes, at least one approved need or evidence source is required before formal submission.

16. **Can one proposal address multiple community needs?**  
    **Default adopted:** Yes.

17. **Can one proposal target multiple barangays?**  
    **Default adopted:** Yes, using a lead barangay and additional target barangays. Evidence and beneficiary estimates remain separable per barangay.

18. **Multiple sitios?**  
    **Default adopted:** Yes.

19. **Multiple SDGs?**  
    **Default adopted:** Yes; AI suggests them and the Researcher confirms them.

20. **What proposal stages are required?**  
    **Default adopted:** Draft → Submitted → Pre-screening → Research/Community Evidence Review → Finance Review → Director Review → Approved. At review stages, a human may return the proposal for revision. Director Review may end in Approved or Rejected.

21. **Who performs final approval?**  
    **Confirmed by the current approved scope:** PARAYA Director.

---

# 29. Auto-Rejection Questions

1. **Do you want all automatic rejection removed?**  
   **Confirmed:** Yes. The system must never automatically reject a proposal.

2. **Should incomplete submissions be blocked before submission instead?**  
   **Confirmed/default clarified:** Yes. Required fields and obvious validation errors block submission or advancement.

3. **Should the system display warnings instead of rejecting?**  
   **Confirmed:** Yes.

4. **Can the system return a proposal for correction automatically if required fields are missing?**  
   **Default adopted:** It may keep the proposal in Draft and show validation errors, but it may not change a submitted proposal to Rejected. Formal revision requests after submission are human initiated.

5. **Must every return/revision action be human initiated?**  
   **Default adopted:** Yes after submission.

6. **Who has authority to reject a proposal?**  
   **Confirmed by the current approved scope:** The PARAYA Director alone performs final rejection.

7. **Can Finance reject the project?**  
   **Default adopted:** No.

8. **Can Finance reject the budget only?**  
   **Default adopted:** Finance returns the budget/proposal for revision or withholds clearance; it does not issue final project rejection.

9. **Can Finance return for revision but not reject the project itself?**  
   **Default adopted:** Yes.

10. **Should rejection require remarks?**  
    **Confirmed:** Yes.

11. **Should every decision remain in the audit trail?**  
    **Confirmed:** Yes, including submission, advancement, warnings, revision requests, finance actions, overrides, approval, and rejection.

---

# 30. Budget Questions

1. **What does “Budget” include?**  
   **Default adopted:** Project budget proposal, categorized budget lines, finance review/return/clearance, funding sources, budget allocation, actual expenditures, budget-versus-actual analysis, remaining balance, supporting documents, liquidation attachments, and revision history.

2. **Project budget proposal?**  
   **Default adopted:** Yes.

3. **Finance clearance?**  
   **Default adopted:** Yes and required before Director approval.

4. **Budget allocation?**  
   **Default adopted:** Yes.

5. **Actual expenditures?**  
   **Default adopted:** Yes.

6. **Liquidation?**  
   **Default adopted:** Yes as a documented summary and attachments; full accounting-ledger functionality is outside scope.

7. **Budget vs. actual comparison?**  
   **Default adopted:** Yes.

8. **Donations included?**  
   **Default adopted:** Yes as a funding/resource source, without treating in-kind donations as cash unless an estimated value is explicitly recorded.

9. **External funding?**  
   **Default adopted:** Yes.

10. **Internal DYCI funding?**  
    **Default adopted:** Yes.

11. **Does every project require a budget?**  
    **Default adopted:** Every project requires a budget section, but it may declare zero cash budget and list in-kind resources.

12. **Can zero-budget projects exist?**  
    **Default adopted:** Yes, with justification and resource plan.

13. **Who prepares the proposed budget?**  
    **Default adopted:** The PARAYA officer encoding/proposing the project, in coordination with the originating proponent where applicable.

14. **Associate?**  
    **Default adopted:** May prepare/edit.

15. **Researcher?**  
    **Default adopted:** May prepare/edit.

16. **Project proponent?**  
    **Default adopted:** May supply the source budget externally, but a PARAYA officer encodes it because the proponent has no login account by default.

17. **Who can edit after Finance comments?**  
    **Default adopted:** The PARAYA officer responsible for the proposal; changes create a new budget revision for re-review.

18. **Should Finance only approve/return?**  
    **Default adopted:** Yes: clear or return for revision.

19. **Can Finance modify figures directly?**  
    **Default adopted:** No.

20. **Should Finance never modify but only request revisions?**  
    **Default adopted:** Yes, preserving separation of duties.

21. **Do you need receipts uploaded?**  
    **Default adopted:** Yes for actual expenditures where applicable.

22. **Purchase requests?**  
    **Default adopted:** Yes as optional/required supporting attachments according to DYCI policy.

23. **Liquidation documents?**  
    **Default adopted:** Yes.

24. **Expense categories?**  
    **Default adopted:** Yes, controlled and configurable.

25. **Budget variance reports?**  
    **Default adopted:** Yes.

26. **Remaining balance?**  
    **Default adopted:** Yes.

27. **Budget revisions?**  
    **Default adopted:** Yes.

28. **Revision history?**  
    **Default adopted:** Yes, immutable version metadata with actor/date/reason.

29. **Finance approval signatures?**  
    **Default adopted:** Store authenticated electronic approval metadata (approver, timestamp, remarks, record hash). A legally binding digital-signature system is outside the initial scope unless separately required.

30. **Does AGAPE process payments or replace the accounting system?**  
    **Default adopted:** No. It tracks proposal/program budget evidence and monitoring only.

---

# 31. Previous-Program Questions

1. **How many years of historical programs exist or should be encoded?**  
   **Default adopted:** Encode up to the most recent five years before AGAPE implementation.

2. **Are those records digital?**  
   **Default adopted:** The system accepts that sources may be mixed; availability must be inventoried during data preparation.

3. **Excel?**  
   **Default adopted:** Accept for structured import where a template can be mapped.

4. **Word?**  
   **Default adopted:** Attach as evidence; key fields are manually encoded.

5. **PDF?**  
   **Default adopted:** Attach as evidence; key fields are manually encoded.

6. **Paper only?**  
   **Default adopted:** Authorized PARAYA staff manually encode the minimum fields and optionally scan supporting pages.

7. **Who will encode old programs?**  
   **Default adopted:** PARAYA Researcher and Associate, with other PARAYA officers allowed to assist.

8. **Who verifies historical programs?**  
   **Default adopted:** Director or delegated Researcher verifies source quality; ambiguous/incomplete cases require officer intervention.

9. **Do historical records have beneficiary counts?**  
   **Default adopted:** Store where available, with source and quality flag.

10. **Budgets?**  
    **Default adopted:** Store where available.

11. **Volunteer records?**  
    **Default adopted:** Store aggregate counts/hours where available; do not create identifiable volunteer records without lawful need.

12. **SDGs?**  
    **Default adopted:** Store documented SDGs; inferred SDGs must be labeled AI-suggested or retrospectively classified and require Researcher confirmation.

13. **Needs addressed?**  
    **Default adopted:** Link to existing need categories or record a historical need description.

14. **Outcomes?**  
    **Default adopted:** Store available output/outcome evidence and follow-up findings.

15. **Should incomplete historical records still be accepted?**  
    **Confirmed:** Yes, with officer intervention.

16. **How should incomplete records be labeled?**  
    **Default adopted:** Complete, Partial-Verified, Partial-Unverified, or Unverified, with missing-field/source notes.

17. **Do you need file attachments from previous programs?**  
    **Default adopted:** Yes, where lawful and available.

18. **Should historical programs affect AI recommendations?**  
    **Confirmed:** Yes, including unverified history, but the AI must show a clear notice, reduce its weight, and explain uncertainty/precautions.

19. **Should previous programs appear in Partnership Management?**  
    **Default adopted:** Yes when linked to a partner.

20. **Should they contribute to SDG analytics?**  
    **Default adopted:** Verified records contribute to primary analytics. Unverified retrospective classifications appear separately or with a visible quality filter.

21. **Should they contribute to impact statistics if data quality is incomplete?**  
    **Default adopted:** Only with visible data-quality labels and separable filters; they must not silently inflate verified impact totals.

---

# 32. Partnership Management Questions

1. **Are partnerships only with barangays?**  
   **Default adopted:** No.

2. **Or also external organizations?**  
   **Default adopted:** Yes.

3. **Should DYCI Offices, Organizations, and Departments be treated as internal partners?**  
   **Default adopted:** Yes, as non-login internal Partner/Proponent records.

4. **Should removed institutional accounts remain as Partner/Proponent records?**  
   **Confirmed:** Yes.

5. **Does each partnership have an MOA/MOU?**  
   **Default adopted:** Support optional/required MOA/MOU metadata according to partner type.

6. **Start and expiration dates?**  
   **Confirmed/default clarified:** Yes.

7. **Contact persons?**  
   **Default adopted:** Yes, support multiple contacts with one primary contact.

8. **Status?**  
   **Default adopted:** Proposed, Active, Expiring Soon, Expired, Suspended, or Ended.

9. **Renewal alerts?**  
   **Default adopted:** Yes, at 60, 30, and 7 days before expiration.

10. **Partnership documents?**  
    **Confirmed/default clarified:** Yes, including MOA/MOU and related attachments with access controls.

11. **Programs implemented?**  
    **Confirmed:** Yes, shown under the partnership.

12. **Beneficiaries served?**  
    **Confirmed:** Yes.

13. **Total budget/resources?**  
    **Confirmed:** Yes.

14. **Total volunteer hours?**  
    **Default adopted:** Yes.

15. **Needs still unaddressed?**  
    **Confirmed:** Yes.

16. **AI partnership recommendations?**  
    **Default adopted:** Yes, advisory recommendations based on needs, program history, outcomes, and partnership capacity.

17. **Should the system suggest when a partnership needs renewal?**  
    **Default adopted:** Yes. Rule-based expiration alerts are authoritative; AI may add an advisory renewal rationale based on performance and remaining needs.

---

# 33. Volunteer Proximity Questions

1. **What does “closest within the perimeter” mean?**  
   **Confirmed/default clarified:** Rank eligible volunteers by distance from their approximate home/base location to the program activity site, after eligibility, skills, and availability are considered.

2. **Closest volunteer to program site?**  
   **Confirmed:** Yes.

3. **Closest program to volunteer?**  
   **Default adopted:** Also allow volunteers to sort available programs by proximity, but the principal panel requirement is volunteer-to-program-site matching.

4. **Both?**  
   **Default adopted:** Yes where feasible.

5. **What distance should be used?**  
   **Default adopted:** A custom radius per program, defaulting to 5 km.

6. **1 km, 3 km, 5 km, or custom?**  
   **Default adopted:** 5 km default; authorized program staff may set a different radius.

7. **Will the program store latitude/longitude?**  
   **Default adopted:** Yes, for each activity/program site, with address/venue name.

8. **Will volunteers provide home locations?**  
   **Default adopted:** They may provide an optional approximate base point or select barangay/sitio. Exact home address is not required for matching.

9. **Exact address?**  
   **Default adopted:** No.

10. **Barangay only?**  
    **Default adopted:** Barangay/sitio is the privacy-preserving fallback when no approximate point is supplied.

11. **GPS location?**  
    **Default adopted:** Optional user-provided approximate coordinate with explicit consent; do not continuously track live location.

12. **Should distance be straight-line or road distance?**  
    **Default adopted:** Straight-line/Haversine distance for the initial capstone. Road-distance APIs are optional future work.

13. **Should location be used only during assignment?**  
    **Default adopted:** Yes, for program discovery/matching/assignment and only while consent remains active.

14. **Should volunteers explicitly consent to location use?**  
    **Default adopted:** Yes.

15. **Should PARAYA see exact locations?**  
    **Default adopted:** No exact home point in ordinary screens.

16. **Or only “within radius” results?**  
    **Default adopted:** Show within/outside radius and approximate distance band; precise stored points are restricted.

17. **Should proximity affect volunteer ranking?**  
    **Default adopted:** Yes, but only after stronger criteria.

18. **What if a farther volunteer has more appropriate skills?**  
    **Default adopted:** The farther volunteer ranks higher when skill suitability outweighs distance.

19. **Should skill matching outrank distance?**  
    **Confirmed/default ranking:** Yes. Ranking order is Eligibility → Skill Match → Schedule Availability → Proximity.

---

# 34. Invitation-Link Questions

1. **Who can generate volunteer invitation links?**  
   **Default adopted:** PARAYA officers and an authorized program leader.

2. **PARAYA only?**  
   **Default adopted:** PARAYA officers by default; delegated program leaders may be granted the capability.

3. **Existing volunteers?**  
   **Default adopted:** Ordinary volunteers cannot generate links unless explicitly designated as program leader.

4. **Program leaders?**  
   **Default adopted:** Yes, when authorized.

5. **Is the link public?**  
   **Default adopted:** It is an unlisted tokenized link that may be shared with intended participants, not published as a permanent public URL.

6. **Does it expire?**  
   **Default adopted:** Yes.

7. **How long?**  
   **Default adopted:** Seven days or the program signup deadline, whichever comes first; the generator may choose a shorter duration.

8. **Is there a maximum number of uses?**  
   **Default adopted:** Yes. Default maximum equals remaining volunteer slots, with an optional lower cap set by the generator.

9. **Does the recipient need a DYCI institutional email?**  
   **Default adopted:** A verified DYCI institutional email is required for normal student-volunteer enrollment; PARAYA may approve an exception for authorized external volunteers if the project scope permits them.

10. **Does the recipient need an existing volunteer account?**  
    **Confirmed:** No.

11. **Can a new user register through the invitation?**  
    **Confirmed:** Yes.

12. **Does clicking the link automatically join the program?**  
    **Confirmed:** Yes, after login/registration and eligibility checks, provided the required-volunteer limit has not been reached.

13. **Or submit a join request?**  
    **Default adopted:** If capacity is full or an eligibility/consent requirement needs review, the system does not auto-join; it may offer a waitlist/request instead.

14. **Does PARAYA approve the joining volunteer?**  
    **Default adopted:** No separate approval is needed for a valid authorized invite when eligibility and capacity checks pass. Exceptions/waitlist requests require PARAYA review.

15. **Can an invite be revoked?**  
    **Default adopted:** Yes.

16. **Should invitation activity be audited?**  
    **Default adopted:** Yes: creation, sender, expiry, uses, registrations, joins, failures, and revocation.

---

# 35. Lessen-Account Questions

1. **Are DYCI Offices definitely no longer system accounts?**  
   **Confirmed by the current approved scope:** Yes. They remain non-login Partner/Proponent records.

2. **Are Student Organizations no longer accounts?**  
   **Confirmed by the current approved scope:** Yes. They remain non-login Partner/Proponent records.

3. **Are Academic Departments no longer accounts?**  
   **Confirmed by the current approved scope:** Yes. They remain non-login Partner/Proponent records.

4. **Should they still exist as Proponent/Partner records?**  
   **Confirmed:** Yes.

5. **Who encodes their proposals?**  
   **Confirmed:** Any of the three PARAYA officers may encode them.

6. **Can the PARAYA Associate encode them on their behalf?**  
   **Confirmed:** Yes.

7. **Can the PARAYA Researcher encode them?**  
   **Confirmed:** Yes.

8. **Can the Director encode them?**  
   **Confirmed:** Yes.

9. **Do they need a temporary submission link instead of an account?**  
   **Default adopted:** No external proposal portal is required in the initial capstone. Proponents send documents through official channels and PARAYA encodes them.

10. **Do they need to view proposal status?**  
    **Default adopted:** They receive status notifications but do not need dashboard access.

11. **How will they see it without logging in?**  
    **Default adopted:** Email status notifications to recorded proponent contacts.

12. **Email status notifications?**  
    **Default adopted:** Yes.

13. **Secure tracking link?**  
    **Default adopted:** Optional future enhancement, not required for initial scope.

14. **Or will all communication happen through PARAYA?**  
    **Default adopted:** Yes, with email notifications supporting the communication trail.

---

# 36. Blockchain Questions

**Current development interpretation (2026-08-28):** The project team understands
the panel request as integrity verification for project funds reviewed by Finance.
The initial implementation is therefore limited to canonical hashes of a
Finance-cleared proposal budget and a Finance-verified liquidation summary. It
does not put individual transactions, receipts, payees, or complete documents
on-chain and does not process payments. Provider, network, contract, and
institutional wallet/custody choices still require confirmation before live use.

1. **What exact research problem should blockchain solve?**  
   **Provisional development decision pending Sir Paul confirmation:** Provide independently verifiable tamper evidence for Finance-cleared budget snapshots and Finance-verified liquidation summaries. It does not replace access control, privacy safeguards, backups, payment processing, accounting, or the operational database.

2. **What did Sir Paul specifically say blockchain should be used for?**  
   **Project-team interpretation; panel confirmation still required:** Project funds reviewed by Finance. The initial technical boundary is the cleared budget and verified liquidation proof; proposal and final program/impact-report proofs are deferred.

3. **Proposal approvals?**  
   **Deferred:** The initial implementation does not create a separate proposal-approval proof. The cleared budget snapshot remains tied to its proposal and exact revision.

4. **Budget transactions?**  
   **Provisional development decision:** Do not put individual transactions on-chain. Anchor the finalized Finance-cleared budget snapshot and Finance-verified liquidation-summary hashes only.

5. **Donations?**  
   **Default adopted:** Keep donation records in the operational database; blockchain anchoring is outside the initial scope unless Sir Paul explicitly requires it.

6. **Volunteer service records?**  
   **Default adopted:** No individual service records on-chain. A finalized aggregate report may be included in a report hash.

7. **Impact reports?**  
   **Deferred:** Not part of the initial Finance Integrity implementation.

8. **Audit logs?**  
   **Default adopted:** Keep full logs in the database; optionally anchor periodic audit-log batch hashes, not every log entry.

9. **All of them?**  
   **Default adopted:** No. Use the narrow finalized-record scope above.

10. **Did he explicitly require a real blockchain network or simply immutable records?**  
    **Needs confirmation; default adopted:** Implement on a blockchain test network for demonstrable verification, while keeping the design portable to a production/permissioned network.

11. **Is using a blockchain test network acceptable?**  
    **Default adopted:** Yes for the capstone.

12. **Does the panel expect smart contracts?**  
    **Default adopted:** Use one minimal smart contract that records document hash, record type/reference, timestamp, and transaction sender. No business workflow is executed automatically by the contract.

13. **Do they expect cryptocurrency?**  
    **Default adopted:** No.

14. **Tokens?**  
    **Default adopted:** No application token.

15. **Wallets?**  
    **Default adopted:** A system-managed institutional wallet may submit hashes. Ordinary users do not manage wallets.

16. **Or absolutely no cryptocurrency?**  
    **Default adopted:** No cryptocurrency is exposed to users or used as a feature. Testnet gas has no user-facing monetary role.

17. **Who operates blockchain nodes?**  
    **Default adopted:** The selected test network supplies the nodes; DYCI/PARAYA manages the application wallet/provider configuration. A private node network is outside initial scope.

18. **DYCI? Barangay? Both?**  
    **Default adopted:** DYCI/PARAYA administers anchoring. Barangay users may verify proofs but do not operate nodes or wallets.

19. **Does the panel expect users to use crypto wallets?**  
    **Default adopted:** No.

20. **Can blockchain be limited to storing record hashes?**  
    **Default adopted:** Yes; only hashes and minimal non-personal verification metadata go on-chain.

21. **Would the panel accept blockchain proof for approved proposals/reports only?**  
    **Needs confirmation:** The current narrower development boundary uses Finance-cleared budgets and verified liquidations; other finalized proposal/report proof classes remain deferred.

22. **What must never be placed on-chain?**  
    **Default adopted:** Resident data, names, contact details, exact addresses, IDs, medical data, full proposal/report documents, receipts containing personal data, passwords, and secrets.

23. **What remains the source of truth?**  
    **Default adopted:** The operational AGAPE database. Blockchain provides timestamped integrity proof for finalized versions.

24. **Question to ask Sir Paul directly (Question 329):**  
    “What exact research problem must blockchain solve in AGAPE, and which finalized record requires blockchain proof that cannot be sufficiently protected by the existing audit log?”

---

# 37. System Administrator Questions

1. **Will there be only one real System Administrator?**  
   **Default adopted:** One primary System Administrator account for the capstone, with institutional emergency recovery handled outside ordinary user provisioning.

2. **The previous respondent design mentioned three System Administrators; is that still correct?**  
   **Default adopted:** No; reduce it to one primary administrator unless the institution explicitly requires named backup administrators.

3. **Can System Admin view resident profiles?**  
   **Default adopted:** No ordinary resident-profile browsing. The Admin manages infrastructure and access, not community research content.

4. **Can Admin restore deleted resident data?**  
   **Default adopted:** Admin can perform authorized backup/version restoration after a documented request from the responsible PARAYA/Privacy authority. The action is audited; restored content is not casually browsed.

5. **Does Admin manage AI configuration?**  
   **Default adopted:** Yes for provider keys, model availability, rate limits, and system configuration—not approval of AI recommendations.

6. **Blockchain configuration?**  
   **Default adopted:** Yes for network/provider, contract address, system wallet integration, health monitoring, and retry handling. Secrets are stored outside the database/UI where appropriate.

7. **Audit log?**  
   **Default adopted:** Yes, read/export access; audit records are append-only through normal operation.

8. **Backup?**  
   **Default adopted:** Yes, including encrypted backup/export and authorized restore.

9. **User invitations?**  
   **Default adopted:** Yes.

10. **Role permissions?**  
    **Default adopted:** Yes, within the approved role matrix. The Admin cannot silently grant a role capabilities outside policy without an audit entry.

---

# 38. Barangay Deployment Questions

1. **How many barangays will the actual system support?**  
   **Default adopted:** Multi-barangay architecture with no fixed hard-coded limit.

2. **How many will contain real resident-level data during the capstone?**  
   **Confirmed by the current approved scope:** One primary pilot barangay—Biñang 2nd—unless additional barangays are formally authorized and prepared to participate.

3. **One or three?**  
   **Default adopted:** One real-data pilot; other barangays may use aggregate, historical, or demonstration data.

4. **Are all three willing to provide household/resident data?**  
   **Default adopted:** Do not assume so. Only onboard resident data after formal authorization and privacy preparation.

5. **Will all three have Captain, Secretary, and Mother Leader accounts?**  
   **Default adopted:** Only live participating barangays receive operational accounts. Demo/test accounts and data must be clearly separated from production data.

6. **Will Biñang 2nd serve as the pilot implementation?**  
   **Confirmed by the current approved scope:** Yes.

7. **How should multiple barangays be reflected in analytics?**  
   **Default adopted:** Users can filter by barangay and profiling cycle. Cross-barangay comparisons must distinguish official totals, sample sizes, coverage, and data quality.

---

# Consolidated Scope Decisions

The next AI should use the following target scope unless explicitly told otherwise. Any item explicitly marked **Needs confirmation** remains provisional and must not be converted into a final architectural assumption:

1. AGAPE profiles every resident within sampled households, not every household in the barangay.
2. Households and residents have unique immutable IDs.
3. Mother Leaders have personal accounts, are assigned to sitios, and can manually encode or CSV/XLSX-import household/resident data only within those sitios.
4. Secretary validation is required before imported or newly encoded profiling data becomes approved.
5. Resident changes use lifecycle statuses and version history, not routine hard deletion.
6. The system displays official barangay totals separately from sample-derived approved profiling totals.
7. AI receives only aggregate/de-identified data and must cite the statistics supporting every recommendation.
8. AI recommends needs, projects, beneficiaries, SDGs, indicative resources, budget ranges, and volunteer estimates; Researcher and Director remain responsible for decisions.
9. Weekly and post-profiling-cycle automation finds High/Critical needs without sufficient planned/active project coverage and creates recommendations only.
10. AI never automatically submits, approves, or rejects proposals.
11. Proposal errors block submission/advancement; human revision and Director-only final rejection replace auto-rejection.
12. All PARAYA officers may encode proposals, including those originating from non-login partner/proponent organizations.
13. Beneficiary categories come from profiling; counts are calculated from approved records and may be overridden with a required reason.
14. AI alignment is explainable, multi-dimensional, advisory, overridable, and audited.
15. Budget scope includes proposal estimates, categorized lines, finance return/clearance, funding sources, actuals, variance, supporting attachments, liquidation evidence, and revisions—but not payment processing or full accounting.
16. Historical programs from the previous five years are encoded with quality labels and may influence AI; unverified data receives lower weight and visible warnings.
17. Partnership Management covers barangays, external organizations, and internal DYCI units as non-login records, including agreements, dates, contacts, documents, programs, beneficiaries, resources, hours, remaining needs, and renewal alerts.
18. Volunteer matching order is Eligibility → Skill Match → Availability → Proximity. Location use requires consent and avoids exposing exact home locations.
19. Authorized invitation links can register new volunteers or enroll existing volunteers, expire, have use/capacity limits, can be revoked, and are audited.
20. Office, Student Organization, and Department login accounts are removed as confirmed by the current approved scope; their organizations remain non-login Partner/Proponent records.
21. **Needs confirmation; default adopted:** Blockchain stores only hashes of finalized approved proposals, finance-clearance/budget summaries, and final reports on a test network through a system-managed wallet. No resident data, tokens, cryptocurrency feature, or user wallets are included.
22. The System Administrator manages accounts, permissions, infrastructure configuration, audit, backup/restore, AI provider settings, and blockchain integration, but does not ordinarily browse resident content.
23. The system supports multiple barangays, with Biñang 2nd confirmed as the primary real-data capstone pilot unless additional barangays are formally authorized and prepared.

---

# Required Safety and Quality Rules

- Apply data minimization and purpose limitation to resident profiling.
- Obtain and record privacy notice acknowledgment/informed consent.
- Allow refusal and correction without unfair service consequences.
- Enforce sitio-, barangay-, and role-based access on the server/database, not only in the user interface.
- Audit sensitive reads, exports, imports, corrections, approvals, overrides, and lifecycle changes.
- Suppress or combine very small demographic groups in analytics to reduce re-identification risk.
- Never send directly identifying resident information to an external or local generative-AI model.
- Show the profiling cycle, sample size, source, date, and data quality beside statistics and AI evidence.
- Label AI budget, staffing, priority, and alignment outputs as estimates/advisory.
- Never place personal data or full documents on a blockchain.
- Keep the database as the operational source of truth and use blockchain only as integrity proof.
