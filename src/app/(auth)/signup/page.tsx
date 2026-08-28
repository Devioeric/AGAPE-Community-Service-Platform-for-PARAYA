"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

const schema = z
  .object({
    fullName: z.string().min(2, "Full name is required").max(150, "Full name is too long"),
    email: z.string().email("Enter a valid email address").max(254, "Email address is too long"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type FormData = z.infer<typeof schema>;

export default function SignupPage() {
  const searchParams = useSearchParams();
  const programInvitationToken = searchParams.get("programInvitationToken");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        ...(programInvitationToken ? { programInvitationToken } : {}),
        fullName: data.fullName,
        email:    data.email,
        password: data.password,
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Registration failed. Please try again.");
      setLoading(false);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md animate-fade-in text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success/10 mb-4">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
          Account Submitted
        </h2>
        <p className="text-muted-foreground mb-6">
          {programInvitationToken
            ? "Your volunteer account is ready and your program invitation was processed."
            : "Your registration is pending admin approval. You’ll receive an email once your account is activated."}
        </p>
        <Link
          href={programInvitationToken ? `/login?next=${encodeURIComponent(`/join/${programInvitationToken}`)}` : "/login"}
          className="text-primary hover:text-primary-dark font-medium transition-colors"
        >
          Return to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-fade-in">
      <div className="text-center mb-8">
        <div className="mb-4">
          <Image src="/paraya-logo.png" alt="PARAYA Logo" width={72} height={72} className="rounded-full mx-auto" priority />
        </div>
        <h1 className="font-heading text-3xl font-bold text-primary-dark">
          Create Account
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Student volunteer registration
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
              {errors.fullName && (
                <p className="text-xs text-danger">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@dyci.edu.ph"
                className="focus-visible:ring-primary/30"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-danger">{errors.email.message}</p>
              )}
            </div>

            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Public registration creates a pending Student Volunteer account only.
              PARAYA, Finance, Barangay, and System Administrator accounts are
              provisioned by an authorized administrator.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                className="focus-visible:ring-primary/30"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-danger">{errors.password.message}</p>
              )}
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
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Account
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary hover:text-primary-dark font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
