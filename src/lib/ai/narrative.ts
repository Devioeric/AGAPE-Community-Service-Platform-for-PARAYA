import { GoogleGenerativeAI } from "@google/generative-ai";
import { callLocalAI, isLocalAIConfigured } from "@/lib/ai/local-ai";
import type { ReportingAggregateDTO } from "@/lib/reporting/contracts";

export async function generateNarrativeReport(aggregate: ReportingAggregateDTO): Promise<string> {
  const { programs, volunteers, donations, needs, proposals } = aggregate;
  const prompt = `You are a professional report writer for PARAYA, the community extension arm of Dr. Yanga's Colleges, Inc. (DYCI).

Write a clear, warm, professional narrative report using only this approved aggregate for ${aggregate.periodStart} to ${aggregate.periodEnd}:
- Programs: ${programs.total} total, ${programs.active} active, ${programs.completed} completed
- Approved volunteer service hours: ${volunteers.approvedServiceHours}
- Active donation records: ${donations.activeRecords}; recorded quantity: ${donations.totalQuantity}
- Community needs documented: ${needs.documented}
- Proposals created: ${proposals.created}

Write four flowing paragraphs about program reach, volunteer participation, resources and impact, and the reporting outlook. Do not invent names, locations, people, activities, outcomes, or statistics. Do not make approval or financial decisions.`;

  if (isLocalAIConfigured()) {
    try {
      return await callLocalAI({ messages: [{ role: "user", content: prompt }], temperature: 0.5, max_tokens: 2048 });
    } catch (error) {
      if (!process.env.GEMINI_API_KEY) throw error;
    }
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No narrative AI provider is configured");
  const result = await new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  return result.response.text();
}
