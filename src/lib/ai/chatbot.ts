import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { callLocalAI, streamLocalAI, isLocalAIConfigured, type LocalAIMessage } from "@/lib/ai/local-ai";
import { roleLabel } from "@/lib/auth/roles";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatbotInput {
  message:             string;
  conversationHistory: ChatMessage[];
  userRole:            string;
  userName:            string;
  /** Role-specific live snapshot from the DB. */
  context?:            string;
}

function navigationMap(role: string): string {
  const isStaff = ["paraya_director", "paraya_associate", "paraya_researcher", "paraya_officer", "finance_officer", "admin"].includes(role);
  const isVolunteer = role === "volunteer";
  const isBarangay  = ["barangay_captain", "barangay_secretary", "barangay_mother_leader", "barangay_official"].includes(role);
  const isPartner   = ["office", "student_org", "department"].includes(role);
  const isAdmin     = role === "admin";

  if (isStaff && !isAdmin) return [
    "Proposals → /officer/proposals (full pipeline: pre-screen → SDG → finance → approval)",
    "Programs → /officer/programs (activities, budget, volunteer assignments)",
    "Surveys → /officer/surveys (builder); analysis under /officer/surveys/analysis",
    "Volunteers → /officer/volunteers (signup roster, hours, departments)",
    "Partnerships → /officer/partnerships (barangay profiles, partnership history, map)",
    "Donations → /officer/donations (donor log, distribution tracking)",
    "Community Needs → /officer/community-profile (with sitio-level breakdown + households)",
    "Skills & Assets → /officer/skills-assets",
    "Finance Clearance → /officer/finance (Finance Officer queue)",
    "Attendance → /officer/attendance (QR/OTP per activity)",
    "Impact Measurement → /officer/impact (quantitative, qualitative, follow-up)",
    "Analytics → /officer/analytics (overview, SDG, volunteers, community-needs, proposals, cross-tabs, snapshots)",
    "AI Reports → /officer/reports (narrative reports + history)",
    "Forum → /officer/forum",
    "Field Observations → /officer/observations",
  ].join("\n");

  if (isVolunteer) return [
    "Programs (browse + sign up) → /volunteer/programs",
    "Schedule (calendar + class entry) → /volunteer/schedule",
    "Log Activity / Hours → /volunteer/log-activity, /volunteer/hours",
    "Check-in (QR/OTP) → /volunteer/check-in",
    "Surveys (interview mode) → /volunteer/surveys",
    "My Barangay → /volunteer/barangay",
    "Forum → /volunteer/forum",
  ].join("\n");

  if (isBarangay) return [
    "Submit Community Needs → /barangay/submit-needs",
    "Approvals (Captain only) → /barangay/approvals",
    "Our Partnership → /barangay/partnership",
    "Reports → /barangay/reports",
    "Surveys → /barangay/surveys",
    "Forum → /barangay/forum",
  ].join("\n");

  if (isPartner) return [
    "Submit Proposals → /partner/proposals",
    "Manage Programs → /partner/programs (activities, budget, volunteer assignments — all subject to PARAYA validation)",
    "Volunteers → /partner/volunteers (department-matched for Department accounts)",
  ].join("\n");

  if (isAdmin) return [
    "User Management → /admin/users (CRUD, invite, password reset)",
    "Audit Logs → /admin/audit-logs",
    "Backup → /admin/backup",
  ].join("\n");

  return "Dashboard → /";
}

const SYSTEM_INSTRUCTION = (userName: string, userRole: string, context: string) =>
  `You are AGAPE Assistant, a helpful AI for the PARAYA community service platform at Dr. Yanga's Colleges, Inc. (DYCI) in Bocaue, Bulacan. The user is ${userName}, a ${roleLabel(userRole)}.

You have live access to AGAPE database data via the DATA block at the bottom of this message. Your job is to ANSWER the user's questions using that data.

RULES:
1. Use ONLY names, titles, numbers, and dates that appear LITERALLY in the DATA block below. Copy them character-for-character. Do not paraphrase or substitute names.
2. If the answer is in DATA, give it. If the specific detail isn't in DATA, point to the right page using the NAVIGATION MAP below.
3. For how-to questions ("how do I log hours?", "where do I submit a proposal?"), answer from general platform knowledge and the NAVIGATION MAP — DATA isn't needed.
4. Never invent program titles, survey names, barangay names, person names, dates, or counts.

FORMATTING:
- A section header / label (like "Skills:", "Programs:", "Recent surveys:") must be written WITHOUT a leading dash, and followed by its items on the next lines. The dash "-" is ONLY for the actual items.
- Correct shape:
  Skills:
  - Tutoring (trade, 5 practitioners)
  - Sewing (trade, 3 practitioners)

  Assets:
  - Patrol van (equipment, qty 2)
- Wrong shape (do NOT do this):
  - Skills:
  - Tutoring (trade, 5 practitioners)
- If you have multiple sections (skills + assets, proposals + programs, etc.), separate each section with a blank line, header on its own line, then dashed items underneath.
- Use **bold** for important values (names, statuses, counts) inside list items.
- Keep replies concise: 1-2 sentences of explanation plus the list, or 2-4 sentences for non-list answers.
- Friendly tone. Use Filipino context where appropriate.

=== NAVIGATION MAP (where things live in the dashboard for a ${roleLabel(userRole)}) ===
${navigationMap(userRole)}
=== END NAVIGATION MAP ===

=== DATA (live snapshot for ${userName}) ===
${context || "(no live data available — answer general/how-to questions only and decline data-specific ones)"}
=== END DATA ===

Now answer the user using ONLY the names and numbers from DATA above. If a fact isn't in DATA, do not make one up — point them to the right page from the NAVIGATION MAP.`;

async function getLocalChatbotResponse({
  message,
  conversationHistory,
  userRole,
  userName,
  context,
}: ChatbotInput): Promise<string> {
  const messages: LocalAIMessage[] = [
    { role: "system", content: SYSTEM_INSTRUCTION(userName, userRole, context ?? "") },
    ...conversationHistory.map<LocalAIMessage>((m) => ({
      role:    m.role,
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  return callLocalAI({ messages, temperature: 0.3, max_tokens: 512 });
}

async function getGeminiChatbotResponse({
  message,
  conversationHistory,
  userRole,
  userName,
  context,
}: ChatbotInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);

  const history: Content[] = conversationHistory.map((m) => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const model = genAI.getGenerativeModel({
    model:             "gemini-2.0-flash",
    systemInstruction: SYSTEM_INSTRUCTION(userName, userRole, context ?? ""),
  });

  const chat   = model.startChat({ history });
  const result = await chat.sendMessage(message);
  return result.response.text();
}

export async function getChatbotResponse(input: ChatbotInput): Promise<string> {
  if (isLocalAIConfigured()) {
    try {
      return await getLocalChatbotResponse(input);
    } catch (err) {
      console.warn("[chatbot] Local AI failed, falling back to Gemini:", err);
      if (!process.env.GEMINI_API_KEY) throw err;
    }
  }
  return getGeminiChatbotResponse(input);
}

/** Streaming version — yields content tokens as the model generates them. */
export async function* streamChatbotResponse(input: ChatbotInput): AsyncIterable<string> {
  if (isLocalAIConfigured()) {
    try {
      yield* streamLocalChatbot(input);
      return;
    } catch (err) {
      console.warn("[chatbot] Local AI stream failed, falling back to Gemini:", err);
      if (!process.env.GEMINI_API_KEY) throw err;
    }
  }
  yield* streamGeminiChatbot(input);
}

async function* streamLocalChatbot({
  message,
  conversationHistory,
  userRole,
  userName,
  context,
}: ChatbotInput): AsyncIterable<string> {
  const messages: LocalAIMessage[] = [
    { role: "system", content: SYSTEM_INSTRUCTION(userName, userRole, context ?? "") },
    ...conversationHistory.map<LocalAIMessage>((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  yield* streamLocalAI({ messages, temperature: 0.3, max_tokens: 512 });
}

async function* streamGeminiChatbot({
  message,
  conversationHistory,
  userRole,
  userName,
  context,
}: ChatbotInput): AsyncIterable<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);

  const history: Content[] = conversationHistory.map((m) => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const model = genAI.getGenerativeModel({
    model:             "gemini-2.0-flash",
    systemInstruction: SYSTEM_INSTRUCTION(userName, userRole, context ?? ""),
  });

  const chat   = model.startChat({ history });
  const result = await chat.sendMessageStream(message);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
