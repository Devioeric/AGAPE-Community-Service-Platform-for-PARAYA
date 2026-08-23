import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCapability } from "@/lib/auth/authorize";
import { generateNarrativeReport } from "@/lib/ai/narrative";

const schema = z.object({ period_start: z.string().date(), period_end: z.string().date() }).strict().refine((value) => value.period_end >= value.period_start, { message: "End date must not precede start date" });

export async function POST(request: Request) {
  const auth = await authorizeCapability("report.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  try {
    const narrative = await generateNarrativeReport({ ...parsed.data, supabase: auth.supabase });
    const { data, error } = await auth.supabase.from("ai_reports").insert({ title: `AI Narrative Report — ${parsed.data.period_start} to ${parsed.data.period_end}`, ...parsed.data, narrative, status: "draft", generated_by: auth.actor.id }).select("id,title,period_start,period_end,narrative,status,generated_by,created_at").single();
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unable to generate the narrative report" }, { status: 503 });
  }
}
