"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2, Camera, KeyRound, User, Bell, Mail, MessageSquare, Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { RoleBadge } from "@/components/shared/StatusBadge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
});

const passwordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password:     z.string().min(8, "New password must be at least 8 characters"),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

type ProfileForm  = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

interface ProfileSettingsProps {
  userName:  string;
  userEmail: string;
  userRole:  string;
}

export function ProfileSettings({ userName, userEmail, userRole }: ProfileSettingsProps) {
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingNotifs,   setSavingNotifs]   = useState(false);
  const [phone,          setPhone]          = useState("");
  const [prefs, setPrefs] = useState<{ in_app: boolean; email: boolean; sms: boolean }>({
    in_app: true, email: true, sms: false,
  });
  const supabase = createClient();

  // Load existing phone + prefs
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j?.data) return;
        setPhone(j.data.phone ?? "");
        const p = j.data.notification_prefs ?? {};
        setPrefs({
          in_app: p.in_app !== false,
          email:  p.email  !== false,
          sms:    p.sms    === true,
        });
      })
      .catch(() => { /* ignore */ });
  }, []);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: userName },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const initials = userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  async function onSaveProfile(data: ProfileForm) {
    setSavingProfile(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: data.full_name }),
    });
    if (res.ok) {
      toast.success("Profile updated successfully.");
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Failed to update profile.");
    }
    setSavingProfile(false);
  }

  async function saveNotifications() {
    setSavingNotifs(true);
    const res = await fetch("/api/profile", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phone: phone.trim(), notification_prefs: prefs }),
    });
    if (res.ok) {
      toast.success("Notification preferences saved.");
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save preferences.");
    }
    setSavingNotifs(false);
  }

  async function onChangePassword(data: PasswordForm) {
    setSavingPassword(true);

    // Verify current password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: data.current_password,
    });
    if (signInError) {
      toast.error("Current password is incorrect.");
      setSavingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: data.new_password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password changed successfully.");
      passwordForm.reset();
    }
    setSavingPassword(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Avatar + identity */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <User className="w-4 h-4 text-accent" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar className="w-20 h-20">
                <AvatarFallback className="text-2xl font-bold bg-primary/20 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md hover:bg-primary-dark transition-colors">
                <Camera className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div>
              <p className="font-semibold text-foreground text-lg">{userName}</p>
              <p className="text-sm text-muted-foreground">{userEmail}</p>
              <div className="mt-1.5">
                <RoleBadge role={userRole} />
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Profile form */}
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                className="focus-visible:ring-primary/30"
                {...profileForm.register("full_name")}
              />
              {profileForm.formState.errors.full_name && (
                <p className="text-xs text-danger">{profileForm.formState.errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={userEmail}
                disabled
                className="bg-muted/40 text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed. Contact an admin if needed.</p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={savingProfile}
                className="bg-primary hover:bg-primary-dark text-white"
              >
                {savingProfile && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notification preferences */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" /> Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-muted-foreground" /> Mobile number
              <span className="text-muted-foreground font-normal">(for SMS)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="09xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="focus-visible:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground">PH mobile number. Only used when SMS notifications are enabled.</p>
          </div>

          <Separator className="bg-border" />

          <div className="space-y-1.5">
            <Label>Delivery channels</Label>
            <p className="text-xs text-muted-foreground mb-3">Choose how you want to receive notifications.</p>
            {[
              { key: "in_app" as const, label: "In-app", icon: Bell,           hint: "Always available in the Notifications page." },
              { key: "email"  as const, label: "Email",  icon: Mail,           hint: "Sent to your account email address." },
              { key: "sms"    as const, label: "SMS",    icon: MessageSquare,  hint: "Sent to your mobile number above. Standard rates may apply." },
            ].map(({ key, label, icon: Icon, hint }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                  prefs[key]
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-surface hover:bg-surface-alt/40",
                )}
              >
                <Icon className={cn("w-4 h-4 mt-0.5", prefs[key] ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", prefs[key] ? "text-foreground" : "text-muted-foreground")}>{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
                </div>
                <div className={cn(
                  "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                  prefs[key] ? "bg-primary" : "bg-border",
                )}>
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                    prefs[key] ? "translate-x-4" : "translate-x-0",
                  )} />
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={saveNotifications}
              disabled={savingNotifs}
              className="bg-primary hover:bg-primary-dark text-white"
            >
              {savingNotifs && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-accent" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current_password">Current password</Label>
              <Input
                id="current_password"
                type="password"
                placeholder="••••••••"
                className="focus-visible:ring-primary/30"
                {...passwordForm.register("current_password")}
              />
              {passwordForm.formState.errors.current_password && (
                <p className="text-xs text-danger">{passwordForm.formState.errors.current_password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                type="password"
                placeholder="Min. 8 characters"
                className="focus-visible:ring-primary/30"
                {...passwordForm.register("new_password")}
              />
              {passwordForm.formState.errors.new_password && (
                <p className="text-xs text-danger">{passwordForm.formState.errors.new_password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input
                id="confirm_password"
                type="password"
                placeholder="Repeat new password"
                className="focus-visible:ring-primary/30"
                {...passwordForm.register("confirm_password")}
              />
              {passwordForm.formState.errors.confirm_password && (
                <p className="text-xs text-danger">{passwordForm.formState.errors.confirm_password.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={savingPassword}
                variant="outline"
                className="border-primary text-primary hover:bg-primary/5"
              >
                {savingPassword && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
