"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    ).replace(/\/$/, "");
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="w-full max-w-md animate-fade-in text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-info/10 mb-4">
          <MailCheck className="w-8 h-8 text-info" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
          Check your email
        </h2>
        <p className="text-muted-foreground mb-6">
          We sent a password reset link to your email address.
        </p>
        <Link
          href="/login"
          className="text-primary hover:text-primary-dark font-medium transition-colors"
        >
          Back to Sign In
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
        <h1 className="font-heading text-2xl font-bold text-primary-dark">
          Reset Password
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your email and we&apos;ll send a reset link
        </p>
      </div>

      <Card className="shadow-card border-border">
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="pt-6 space-y-4">
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
          </CardContent>

          <CardFooter className="flex-col gap-3 pb-6">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Send Reset Link
            </Button>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Sign In
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
