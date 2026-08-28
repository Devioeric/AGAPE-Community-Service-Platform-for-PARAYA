"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Invitation = {
  programId: string;
  title: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  expiresAt: string;
  available: boolean;
  capacityAvailable: boolean;
  requiresInstitutionalEmail: boolean;
  allowedEmailDomain: string;
};

export default function ProgramInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v2/program-invitations/resolve?token=${encodeURIComponent(token)}`),
      supabase.auth.getUser(),
    ]).then(async ([response, auth]) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Invitation not found.");
      }
      const body = await response.json();
      setInvitation(body.data);
      setSignedIn(Boolean(auth.data.user));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Invitation not found."))
      .finally(() => setLoading(false));
  }, [supabase, token]);

  async function join() {
    setJoining(true);
    const response = await fetch("/api/v2/program-invitations/join", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => ({}));
    setJoining(false);
    if (!response.ok) return toast.error(body.error ?? "Unable to join this program.");
    if (body.data?.state === "waitlisted") toast.success("You were added to the program waitlist.");
    else toast.success("You joined the program.");
    router.push("/volunteer/programs");
  }

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (error || !invitation) return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-3">
        <h1 className="font-heading text-2xl font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">{error ?? "This invitation is invalid or expired."}</p>
        <Link className={buttonVariants({ variant: "outline" })} href="/login">Return to sign in</Link>
      </CardContent></Card>
    </div>
  );

  return <div className="min-h-[60vh] grid place-items-center px-4">
    <Card className="max-w-lg w-full">
      <CardHeader><CardTitle className="font-heading text-2xl">{invitation.title}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="flex gap-2"><Calendar className="h-4 w-4" />{invitation.startsOn ?? "Schedule to be announced"}{invitation.endsOn ? ` – ${invitation.endsOn}` : ""}</p>
          <p className="flex gap-2"><Users className="h-4 w-4" />{invitation.capacityAvailable ? "Slots are currently available" : "Program is full; eligible volunteers may join the waitlist"}</p>
          {invitation.requiresInstitutionalEmail && <p>Use your @{invitation.allowedEmailDomain} address.</p>}
        </div>
        {!invitation.available ? <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">This invitation has expired, was revoked, or reached its use limit.</p>
          : signedIn ? <Button className="w-full" onClick={join} disabled={joining}>{joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Join program</Button>
          : <div className="grid gap-2 sm:grid-cols-2">
              <Link className={buttonVariants()} href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>Sign in to join</Link>
              <Link className={buttonVariants({ variant: "outline" })} href={`/signup?programInvitationToken=${encodeURIComponent(token)}`}>Create volunteer account</Link>
            </div>}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Secure invitation. No home-location details are shared.</p>
      </CardContent>
    </Card>
  </div>;
}
