import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callLocalAI, isLocalAIConfigured } from "@/lib/ai/local-ai";

interface NarrativeInput {
  period_start: string;
  period_end:   string;
  supabase:     SupabaseClient;
}

export async function generateNarrativeReport({
  period_start,
  period_end,
  supabase,
}: NarrativeInput): Promise<string> {
  const [programs, logs, donations, needs, proposals] = await Promise.all([
    supabase
      .from("programs")
      .select("title, status, barangays(name)")
      .gte("start_date", period_start)
      .lte("end_date",   period_end),
    supabase
      .from("activity_logs")
      .select("hours")
      .eq("status", "approved")
      .gte("date", period_start)
      .lte("date", period_end),
    supabase
      .from("donations")
      .select("item_type, quantity")
      .is("archived_at", null)
      .gte("received_date", period_start)
      .lte("received_date", period_end),
    supabase
      .from("community_needs")
      .select("category, priority")
      .gte("created_at", period_start)
      .lte("created_at", period_end),
    supabase
      .from("project_proposals")
      .select("status")
      .gte("created_at", period_start)
      .lte("created_at", period_end),
  ]);

  const totalHours = (logs.data ?? []).reduce((s, l) => s + (l.hours ?? 0), 0);
  const totalDonationQty = (donations.data ?? []).reduce((s, d) => s + (d.quantity ?? 0), 0);

  const programsByStatus = (programs.data ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const prompt = `You are a professional report writer for PARAYA, the community extension arm of Dr. Yanga's Colleges, Inc. (DYCI) in Bocaue, Bulacan. PARAYA stands for PAmayanan (community development), paaRAlan (academic partnership), and parokYA (parish partnership).

Write a clear, warm, and professional narrative report based on the following data for the period ${period_start} to ${period_end}:

PROGRAMS:
- Total programs in period: ${(programs.data ?? []).length}
- Active: ${programsByStatus.active ?? 0}, Completed: ${programsByStatus.completed ?? 0}, Upcoming: ${programsByStatus.upcoming ?? 0}

VOLUNTEERS:
- Total approved service hours: ${totalHours.toFixed(1)} hours

DONATIONS:
- Total donation records: ${(donations.data ?? []).length}
- Total items received: ${totalDonationQty} units

COMMUNITY NEEDS:
- Needs documented: ${(needs.data ?? []).length}

PROPOSALS:
- Proposals submitted: ${(proposals.data ?? []).length}

Write 4 paragraphs covering: (1) program highlights and community reach, (2) volunteer engagement and service hours, (3) resources, donations, and community needs response, and (4) proposals in progress and outlook. Use a professional yet warm institutional tone. Do not add headings or bullet points — write flowing paragraphs only.`;

  if (isLocalAIConfigured()) {
    try {
      return await callLocalAI({
        messages:    [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens:  2048,
      });
    } catch (err) {
      console.warn("[narrative] Local AI failed, falling back to Gemini:", err);
      if (!process.env.GEMINI_API_KEY) throw err;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Neither LOCAL_AI_API_KEY nor GEMINI_API_KEY is configured");
  const genAI  = new GoogleGenerativeAI(apiKey);
  const model  = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
