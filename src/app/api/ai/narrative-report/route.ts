import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { generateNarrativeReport } from "@/lib/ai/narrative";
import { reportingAggregateSchema } from "@/lib/reporting/contracts";

const schema = z.object({ period_start: z.string().date(), period_end: z.string().date() }).strict()
  .refine(value => value.period_end >= value.period_start, { message: "End date must not precede start date" });

export async function POST(request: Request) {
  const auth = await authorizeCapability("report.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue => issue.message).join("; ") }, { status: 400 });
  try {
    const aggregateResult = await auth.supabase.rpc("phase6_reporting_aggregate", {
      p_period_start: parsed.data.period_start,
      p_period_end: parsed.data.period_end,
    });
    if (aggregateResult.error) throw aggregateResult.error;
    const aggregate = reportingAggregateSchema.parse(aggregateResult.data);
    const narrative = await generateNarrativeReport(aggregate);
    const created = await auth.supabase.rpc("phase6_create_report", {
      p_title: `AI Narrative Report — ${parsed.data.period_start} to ${parsed.data.period_end}`,
      p_period_start: parsed.data.period_start,
      p_period_end: parsed.data.period_end,
      p_narrative: narrative,
      p_source_metadata: aggregate,
    });
    if (created.error) throw created.error;
    return NextResponse.json({ data: created.data });
  } catch {
    return NextResponse.json({ error: "Unable to generate the narrative report" }, { status: 503 });
  }
}
