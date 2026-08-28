import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/shared/ProfileSettings";
import { VolunteerMatchingPreferences } from "@/components/volunteers/VolunteerMatchingPreferences";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <ProfileSettings
        userName={profile?.full_name ?? user.email ?? "User"}
        userEmail={user.email ?? ""}
        userRole={profile?.role ?? "volunteer"}
      />
      <VolunteerMatchingPreferences />
    </div>
  );
}
