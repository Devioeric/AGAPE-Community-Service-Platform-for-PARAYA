"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle, KeyRound, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRecentPasswordRecovery } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/client";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password is too long"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [checking, setChecking] = useState(true);
  const [validRecovery, setValidRecovery] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    let cancelled = false;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoveryFragment =
      hash.has("access_token") || hash.get("type") === "recovery";
    const hasFragmentError = hash.has("error") || hash.has("error_code");

    const acceptRecoveryUser = (user: User | null): boolean => {
      if (!user || !isRecentPasswordRecovery(user.recovery_sent_at)) return false;
      if (!cancelled) {
        if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`
          );
        }
        setValidRecovery(true);
        setChecking(false);
      }
      return true;
    };

    if (hasFragmentError) {
      setValidRecovery(false);
      setChecking(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        acceptRecoveryUser(session?.user ?? null);
      }
    );

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || acceptRecoveryUser(user)) return;
      if (!hasRecoveryFragment) {
        setValidRecovery(false);
        setChecking(false);
      }
    });

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setValidRecovery(false);
        setChecking(false);
      }
    }, 5000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [supabase]);

  async function onSubmit(data: FormData) {
    if (!validRecovery) return;
    setSubmitting(true);

    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    setComplete(true);
    await supabase.auth.signOut({ scope: "global" });

    window.setTimeout(() => {
      router.replace("/login");
      router.refresh();
    }, 2000);
  }

  if (checking) {
    return (
      <div className="text-center">
        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Verifying your reset link...</p>
      </div>
    );
  }

  if (!validRecovery) {
    return (
      <div className="w-full max-w-md animate-fade-in text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10">
          <AlertTriangle className="h-8 w-8 text-warning" />
        </div>
        <h1 className="mb-2 font-heading text-2xl font-bold text-foreground">
          Reset Link Invalid
        </h1>
        <p className="mb-6 text-muted-foreground">
          This password reset link is missing, expired, or has already been used.
        </p>
        <Link
          href="/forgot-password"
          className="font-medium text-primary transition-colors hover:text-primary-dark"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="w-full max-w-md animate-fade-in text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <h1 className="mb-2 font-heading text-2xl font-bold text-foreground">
          Password Updated
        </h1>
        <p className="text-muted-foreground">
          Your password has been changed. Redirecting you to sign in...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-fade-in">
      <div className="mb-8 text-center">
        <Image
          src="/paraya-logo.png"
          alt="PARAYA Logo"
          width={72}
          height={72}
          className="mx-auto mb-4 rounded-full"
          priority
        />
        <h1 className="font-heading text-2xl font-bold text-primary-dark">
          Choose a New Password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use at least 8 characters for your new password
        </p>
      </div>

      <Card className="border-border shadow-card">
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="password">
                <KeyRound className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
                New password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                className="focus-visible:ring-primary/30"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-danger">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="focus-visible:ring-primary/30"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-danger">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3 pb-6">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-white hover:bg-primary-dark"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
            <Link
              href="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to Sign In
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
