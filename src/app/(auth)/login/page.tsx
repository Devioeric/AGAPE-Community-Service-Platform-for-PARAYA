"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { isActiveAccount } from "@/lib/auth/account-status";
import { isActiveLoginRole, isRetiredBarangayRole, ROLE_HOME } from "@/lib/auth/roles";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (searchParams.get("reason") === "role_retired") {
      toast.error("This barangay role has been retired; contact the administrator.");
    }
  }, [searchParams]);

  async function onSubmit(data: FormData) {
    setLoading(true);
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      const isInactive =
        error.code === "user_banned" || /banned/i.test(error.message);
      toast.error(
        isInactive
          ? "This account is pending approval or has been suspended. Contact an administrator."
          : error.message
      );
      setLoading(false);
      return;
    }

    const { data: hasRetiredBarangayRole } = await supabase.rpc(
      "phase0_current_account_has_retired_barangay_role"
    );

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, status, is_active")
      .eq("id", authData.user.id)
      .single();

    if (hasRetiredBarangayRole === true || profileError || !isActiveAccount(profile) || !isActiveLoginRole(profile?.role) || isRetiredBarangayRole(profile?.role)) {
      await supabase.auth.signOut();
      toast.error(
        hasRetiredBarangayRole === true || isRetiredBarangayRole(profile?.role)
          ? "This barangay role has been retired; contact the administrator."
          : "This account is pending approval, suspended, or unavailable. Contact an administrator."
      );
      setLoading(false);
      return;
    }

    const home = profile?.role ? ROLE_HOME[profile.role] : undefined;
    if (!home) {
      await supabase.auth.signOut();
      toast.error("This account role is unavailable. Contact an administrator.");
      setLoading(false);
      return;
    }
    const requested = searchParams.get("next");
    const destination =
      requested?.startsWith("/join/") && !requested.startsWith("//") ? requested : home;
    router.replace(destination);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md animate-fade-in">
      {/* Logo / Brand */}
      <div className="text-center mb-8">
        <div className="mb-4">
          <Image src="/paraya-logo.png" alt="PARAYA Logo" width={72} height={72} className="rounded-full mx-auto" priority />
        </div>
        <h1 className="font-heading text-3xl font-bold text-primary-dark">
          AGAPE
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium tracking-wide uppercase">
          PARAYA — Dr. Yanga&apos;s Colleges, Inc.
        </p>
        <p className="text-base text-foreground/70 mt-3 italic font-heading">
          &ldquo;Empowering Communities Through Service&rdquo;
        </p>
      </div>

      <Card className="shadow-card border-border gap-0 py-0">
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5 px-4 py-6">
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:text-primary-dark transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="focus-visible:ring-primary/30"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-danger">{errors.password.message}</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3 px-4 py-5">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white transition-colors duration-200"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Sign In
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-primary hover:text-primary-dark font-medium transition-colors"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
