import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ProfileSettings } from "@/components/shared/ProfileSettings";

export default async function ContributorProfilePage() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("x-user-email");
  const fullName = requestHeaders.get("x-user-name");
  const role = requestHeaders.get("x-user-role");

  if (!email || role !== "contributor") redirect("/login");

  return (
    <ProfileSettings
      userName={fullName || email}
      userEmail={email}
      userRole={role}
    />
  );
}
