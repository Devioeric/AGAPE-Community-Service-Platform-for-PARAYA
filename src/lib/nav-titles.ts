// Header titles per route. The labels follow the scope module names so the
// header reads consistently with the sidebar groupings.
const TITLES: Record<string, string> = {
  // Officer — PARAYA staff
  "/officer":                            "Dashboard",
  // Partnership Management Module
  "/officer/partnerships":               "Partnership Management",
  // Project Proposal and Approval Workflow Module
  "/officer/proposals":                  "Project Proposals",
  "/officer/finance":                    "Finance Clearance",
  // Community Needs Assessment Module
  "/officer/community-profile":          "Community Profile",
  "/officer/surveys":                    "Survey Builder",
  "/officer/surveys/analysis":           "Survey Analysis",
  "/officer/surveys/compare":            "Pre/Post Comparison",
  "/officer/observations":               "Field Observations",
  // Volunteer Management Module
  "/officer/volunteers":                 "Volunteer Directory",
  "/officer/attendance":                 "Attendance",
  // Skill and Asset Documentation Module
  "/officer/skills-assets":              "Skill & Asset Documentation",
  // Program Tracking and Monitoring Module
  "/officer/programs":                   "Program Tracking",
  // Donation and Resource Management Module
  "/officer/donations":                  "Donation Management",
  // Analytics Module
  "/officer/analytics":                  "Analytics Overview",
  "/officer/analytics/sdg":              "SDG Impact Tracker",
  "/officer/analytics/volunteers":       "Volunteer Analytics",
  "/officer/analytics/community-needs":  "Community Needs Analytics",
  "/officer/analytics/proposals":        "Proposal Pipeline",
  "/officer/analytics/cross-tabs":       "Survey Cross-Tabulations",
  "/officer/analytics/snapshots":        "Report Snapshots",
  // Impact Measurement Module
  "/officer/impact":                     "Impact Measurement",
  // Reporting Module
  "/officer/reports":                    "Reporting",
  // Communication Module
  "/officer/forum":                      "Discussion Forum",
  "/officer/chatbot":                    "Conversational AI Chatbot",
  "/officer/notifications":              "Notifications",
  "/officer/profile":                    "Profile Settings",

  // Volunteer
  "/volunteer":                          "Dashboard",
  "/volunteer/barangay":                 "Partnership Management",
  "/volunteer/programs":                 "Available Programs",
  "/volunteer/schedule":                 "My Schedule",
  "/volunteer/check-in":                 "Check In",
  "/volunteer/log-activity":             "Log Activity",
  "/volunteer/hours":                    "My Hours",
  "/volunteer/surveys":                  "Beneficiary Surveys",
  "/volunteer/forum":                    "Discussion Forum",
  "/volunteer/chatbot":                  "Conversational AI Chatbot",
  "/volunteer/notifications":            "Notifications",
  "/volunteer/profile":                  "Profile Settings",

  // Barangay
  "/barangay":                           "Dashboard",
  "/barangay/partnership":               "Partnership Management",
  "/barangay/submit-needs":              "Submit Community Needs",
  "/barangay/approvals":                 "Community Needs Approval Queue",
  "/barangay/surveys":                   "Survey Responses",
  "/barangay/reports":                   "Reporting",
  "/barangay/forum":                     "Discussion Forum",
  "/barangay/chatbot":                   "Conversational AI Chatbot",
  "/barangay/notifications":             "Notifications",
  "/barangay/profile":                   "Profile Settings",

  // Partner (Office / Student Organization / Department)
  "/partner":                            "Dashboard",
  "/partner/proposals":                  "Project Proposals",
  "/partner/programs":                   "Program Tracking",
  "/partner/volunteers":                 "Volunteer Management",
  "/partner/forum":                      "Discussion Forum",
  "/partner/chatbot":                    "Conversational AI Chatbot",
  "/partner/notifications":              "Notifications",
  "/partner/profile":                    "Profile Settings",

  // Admin
  "/admin":                              "Dashboard",
  "/admin/users":                        "User Management",
  "/admin/audit-logs":                   "Audit Logs",
  "/admin/backup":                       "Backup & Recovery",
  "/admin/chatbot":                      "Conversational AI Chatbot",
  "/admin/notifications":                "Notifications",
  "/admin/profile":                      "Profile Settings",
};

export function getPageTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  // Fuzzy match for dynamic segments — pick the LONGEST prefix so
  // `/officer/surveys/analysis/...` resolves to "Survey Analysis" rather
  // than the shorter `/officer/surveys` "Survey Builder".
  let best = "";
  for (const k of Object.keys(TITLES)) {
    if (k === "/") continue;
    if (pathname.startsWith(k) && k.length > best.length) best = k;
  }
  return best ? TITLES[best] : "AGAPE";
}
