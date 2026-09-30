"use client";

import { MyBarangayView } from "@/components/shared/MyBarangayView";

export default function VolunteerBarangayPage() {
  return (
    <div className="space-y-4">
      <MyBarangayView
        emptyMessage="You haven't been assigned to a barangay yet. Contact a PARAYA officer or system administrator to get assigned."
      />
    </div>
  );
}
