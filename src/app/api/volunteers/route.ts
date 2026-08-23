import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";

export async function GET() {
  const auth = await authorizeCapability("volunteer.directory.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.supabase;

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, status, created_at")
    .eq("role", "volunteer")
    .order("full_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
