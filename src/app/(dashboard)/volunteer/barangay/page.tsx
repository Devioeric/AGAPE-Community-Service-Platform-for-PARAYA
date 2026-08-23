"use client";

import { MyBarangayView } from "@/components/shared/MyBarangayView";

export default function VolunteerBarangayPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">My Assigned Barangay</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          The community you&apos;re assigned to serve. Contact details, partnership history, and programs hosted here.
        </p>
      </div>
      <MyBarangayView
        emptyMessage="You haven't been assigned to a barangay yet. Contact a PARAYA officer or system administrator to get assigned."
      />
    </div>
  );
}
