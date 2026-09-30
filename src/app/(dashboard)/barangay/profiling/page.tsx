import { SecretaryCommunityProfile } from "@/components/community-profile/SecretaryCommunityProfile";
import { SectionTabs } from "@/components/layout/SectionTabs";
export default function BarangayProfilingPage() {
  return <div className="space-y-5"><SectionTabs section="barangay.needs-assessment" label="Community Needs Assessment sections" /><SecretaryCommunityProfile /></div>;
}
