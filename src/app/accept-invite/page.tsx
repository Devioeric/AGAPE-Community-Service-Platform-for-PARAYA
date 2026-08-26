"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle, KeyRound, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ROLE_HOME } from "@/lib/auth/roles";

const schema = z
  .object({
    fullName:        z.string().min(2, "Full name is required"),
    password:        z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type FormData = z.infer<typeof schema>;

export default function AcceptInvitePage() {
  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const verifiedSession = useRef(false);

  const [ready,     setReady]     = useState(false);
  const [done,      setDone]      = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<{ code: string; message: string } | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // Supabase puts error info in the URL hash when the invite link is invalid
    // or expired (e.g. #error=access_denied&error_code=otp_expired).
    if (window.location.hash) {
      const error  = hash.get("error");
      const code   = hash.get("error_code");
      const desc   = hash.get("error_description");
      if (error) {
        setLinkError({
          code:    code ?? error,
          message: (desc ?? "This invitation link is invalid or has expired.").replace(/\+/g, " "),
        });
        return;
      }
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const inviteType = hash.get("type");
    if ((accessToken || refreshToken) && (!accessToken || !refreshToken || inviteType !== "invite")) {
      setLinkError({
        code: "invalid_invite_session",
        message: "This invitation session is incomplete or has the wrong type.",
      });
      return;
    }

    const markReady = () => {
      verifiedSession.current = true;
      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      setReady(true);
    };

    // Server-generated invitations use an implicit one-time session in the URL
    // fragment. The ordinary SSR browser client uses PKCE, so consume this
    // invite-only fragment explicitly before rendering the activation form.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        markReady();
      }
    });

    if (accessToken && refreshToken) {
      void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (error || !data.session?.user) {
            setLinkError({
              code: "invalid_invite_session",
              message: "This invitation session could not be verified.",
            });
            return;
          }
          markReady();
        });
    }

    // Also handle case where session is already active (page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        markReady();
      }
    });

    // Fallback: if neither an auth event nor an error hash arrives within 10s,
    // surface a generic error rather than spinning forever.
    const timeoutId = window.setTimeout(() => {
      if (verifiedSession.current) return;
      setLinkError((prev) => prev ?? {
        code: "timeout",
        message: "We couldn't verify your invitation. The link may be invalid or expired.",
      });
    }, 10_000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [supabase]);

  async function onSubmit(data: FormData) {
    setSubmitting(true);

    try {
      // The invite session may update its own password, but only the trusted
      // server endpoint can activate the application account.
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.password,
        data: { full_name: data.fullName },
      });

      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: data.fullName }),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        role?: string;
      };

      if (!response.ok || !result.role) {
        toast.error(result.error ?? "Account setup failed. Please contact an administrator.");
        return;
      }

      setDone(true);

      // Redirect to the database-authoritative role returned by the endpoint.
      setTimeout(() => {
        const home = ROLE_HOME[result.role!] ?? "/volunteer";
        router.replace(home);
        router.refresh();
      }, 2000);
    } catch {
      toast.error("Account setup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Invitation link is invalid or expired
  if (linkError) {
    const isExpired = linkError.code === "otp_expired";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/10 mb-4">
            <AlertTriangle className="w-8 h-8 text-warning" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
            {isExpired ? "Invitation Expired" : "Invitation Invalid"}
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            {linkError.message} Please ask your administrator to send a new invitation.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  // Still waiting for Supabase to process the invite token from the URL hash
  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Verifying your invitation…</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success/10 mb-4">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">Account Ready!</h2>
          <p className="text-muted-foreground text-sm">Your account has been set up. Redirecting you to the dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/paraya-logo.png" alt="PARAYA Logo" width={64} height={64} className="rounded-full mx-auto mb-4" priority />
          <h1 className="font-heading text-2xl font-bold text-primary-dark">Complete Your Account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You&apos;ve been invited to join AGAPE. Set your name and password to get started.
          </p>
        </div>

        <Card className="shadow-card border-border">
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  placeholder="Juan dela Cruz"
                  className="focus-visible:ring-primary/30"
                  {...register("fullName")}
                />
                {errors.fullName && <p className="text-xs text-danger">{errors.fullName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">
                  <KeyRound className="inline w-3.5 h-3.5 mr-1 mb-0.5" />
                  Set password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  className="focus-visible:ring-primary/30"
                  {...register("password")}
                />
                {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat password"
                  className="focus-visible:ring-primary/30"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && <p className="text-xs text-danger">{errors.confirmPassword.message}</p>}
              </div>
            </CardContent>

            <CardFooter className="pb-6">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary-dark text-white"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Activate Account
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
