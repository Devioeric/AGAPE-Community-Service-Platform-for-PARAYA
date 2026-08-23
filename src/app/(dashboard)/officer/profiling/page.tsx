import { ProfilingWorkspace } from "@/components/profiling/ProfilingWorkspace";
import { headers } from "next/headers";
export default async function OfficerProfilingPage() { const role = (await headers()).get("x-user-role") ?? ""; return <ProfilingWorkspace audience="paraya" role={role} />; }
