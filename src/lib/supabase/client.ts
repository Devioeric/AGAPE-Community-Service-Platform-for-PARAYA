import { createBrowserClient } from "@supabase/ssr";
import { localPreviewAuthOptions } from "./local-preview";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    localPreviewAuthOptions()
  );
}
