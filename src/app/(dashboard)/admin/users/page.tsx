"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search, UserPlus, MoreHorizontal, CheckCircle,
  XCircle, ShieldCheck, Filter, Loader2, Mail,
  Pencil, MapPin, ToggleLeft, ToggleRight, KeyRound,
  Eye, EyeOff, AlertTriangle, Building2, Copy, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, RoleBadge } from "@/components/shared/StatusBadge";
import { toast } from "sonner";
import { DYCI_DEPARTMENTS } from "@/lib/constants";
import { permissionModulesForRole } from "@/lib/auth/capabilities";

import { ASSIGNABLE_ROLES, isBarangayRole, type Role } from "@/lib/auth/roles";

// ─── Types ─────────────────────────────────────────────────────────────────────

type UserRole   = Role;
type UserStatus = "active" | "pending" | "suspended";

interface User {
  id:          string;
  full_name:   string;
  email:       string;
  role:        UserRole;
  status:      UserStatus;
  barangay_id: string | null;
  permissions: Record<string, boolean>;
  created_at:  string;
  updated_at:  string;
  barangays:   { name: string } | null;
}

interface Barangay { id: string; name: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROLE_FILTERS = [
  { value: "all",                      label: "All Roles" },
  // Grouped by org
  { value: "paraya_director",          label: "PARAYA — Director" },
  { value: "paraya_associate",         label: "PARAYA — Associate" },
  { value: "paraya_researcher",        label: "PARAYA — Researcher" },
  { value: "finance_officer",          label: "Finance Officer" },
  { value: "volunteer",                label: "Volunteers" },
  { value: "barangay_captain",         label: "Barangay — Captain" },
  { value: "barangay_secretary",       label: "Barangay — Secretary" },
  { value: "barangay_mother_leader",   label: "Barangay — Mother Leader" },
  { value: "admin",                    label: "Admins" },
];
const STATUS_FILTERS = [
  { value: "all",       label: "All Status" },
  { value: "active",    label: "Active" },
  { value: "pending",   label: "Pending" },
  { value: "suspended", label: "Suspended" },
];

// Roles assignable via invite + edit dropdowns (admin is excluded — admins are created via DB).
const EDITABLE_ROLES = ASSIGNABLE_ROLES.map((r) => ({ value: r.value, label: r.label }));

function formatDate(iso: string) {
  const d   = new Date(iso);
  const now = new Date();
  const td  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yd  = td - 86_400_000;
  const dd  = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (dd === td) return "Today";
  if (dd === yd) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Module Toggle component ────────────────────────────────────────────────────

function ModuleToggle({
  moduleKey, label, description, enabled, onToggle,
}: { moduleKey: string; label: string; description: string; enabled: boolean; onToggle: (key: string, val: boolean) => void }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-3 border-b border-border/60 last:border-0 cursor-pointer group"
      onClick={() => onToggle(moduleKey, !enabled)}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="flex-shrink-0 mt-0.5">
        {enabled
          ? <ToggleRight className="w-6 h-6 text-success" />
          : <ToggleLeft  className="w-6 h-6 text-muted-foreground/40" />}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers]               = useState<User[]>([]);
  const [barangays, setBarangays]       = useState<Barangay[]>([]);
  const [loading, setLoading]           = useState(true);
  const [actionId, setActionId]         = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [roleFilter, setRoleFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Add User dialog (direct create with temp password) ────────────────────────
  const [addOpen, setAddOpen]           = useState(false);
  const [addEmail, setAddEmail]         = useState("");
  const [addName, setAddName]           = useState("");
  const [addRole, setAddRole]           = useState<string>("volunteer");
  const [addBrgy, setAddBrgy]           = useState<string>("");
  const [addDepartment, setAddDepartment] = useState("");
  const [addPassword, setAddPassword]   = useState("");
  const [addShowPw, setAddShowPw]       = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // ── Edit dialog ───────────────────────────────────────────────────────────────
  const [editUser, setEditUser]         = useState<User | null>(null);
  const [editName, setEditName]         = useState<string>("");
  const [editRole, setEditRole]         = useState<string>("volunteer");
  const [editBrgy, setEditBrgy]         = useState<string>("");
  const [editStatus, setEditStatus]     = useState<UserStatus>("active");
  const [editPerms, setEditPerms]       = useState<Record<string, boolean>>({});
  const [editSaving, setEditSaving]     = useState(false);

  // ── Password reset dialog ─────────────────────────────────────────────────────
  const [pwUser, setPwUser]             = useState<User | null>(null);
  const [pwMode, setPwMode]             = useState<"set" | "email">("email");
  const [pwNew, setPwNew]               = useState("");
  const [pwConfirm, setPwConfirm]       = useState("");
  const [pwAdmin, setPwAdmin]           = useState("");
  const [pwShowNew, setPwShowNew]       = useState(false);
  const [pwShowAdmin, setPwShowAdmin]   = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).data ?? []);
    else toast.error("Failed to load users.");
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/user-provisioning-options")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load barangay assignment options.");
        return response.json() as Promise<{ data?: { barangays?: Barangay[] } }>;
      })
      .then((payload) => {
        if (active) setBarangays(payload.data?.barangays ?? []);
      })
      .catch(() => {
        if (active) toast.error("Unable to load barangay assignment options.");
      });
    return () => { active = false; };
  }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() =>
    users.filter((u) => {
      const q = search.toLowerCase();
      return (
        (u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (roleFilter   === "all" || u.role   === roleFilter) &&
        (statusFilter === "all" || u.status === statusFilter)
      );
    }), [users, search, roleFilter, statusFilter]);

  const counts = useMemo(() => ({
    total:     users.length,
    active:    users.filter((u) => u.status === "active").length,
    pending:   users.filter((u) => u.status === "pending").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  }), [users]);

  // ── Status quick-actions ──────────────────────────────────────────────────────

  async function updateStatus(id: string, status: UserStatus, label: string) {
    setActionId(id);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status } : u));
      toast.success(`User ${label}.`);
    } else {
      toast.error("Action failed.");
    }
    setActionId(null);
  }

  // ── Add User (direct create) ──────────────────────────────────────────────────

  function generatePassword() {
    // 12 chars, mix of upper/lower/digit/symbol
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";  // exclude I, O for legibility
    const lower = "abcdefghijkmnpqrstuvwxyz";  // exclude l, o
    const digit = "23456789";                   // exclude 0, 1
    const sym   = "!@#$%&*";
    const all   = upper + lower + digit + sym;
    let pw = "";
    pw += upper[Math.floor(Math.random() * upper.length)];
    pw += lower[Math.floor(Math.random() * lower.length)];
    pw += digit[Math.floor(Math.random() * digit.length)];
    pw += sym[Math.floor(Math.random() * sym.length)];
    for (let i = 0; i < 8; i++) pw += all[Math.floor(Math.random() * all.length)];
    return pw.split("").sort(() => Math.random() - 0.5).join("");
  }

  function openAdd() {
    setAddEmail("");
    setAddName("");
    setAddRole("volunteer");
    setAddBrgy("");
    setAddDepartment("");
    setAddPassword(generatePassword());
    setAddShowPw(false);
    setAddOpen(true);
  }

  function handleAddRoleChange(newRole: string) {
    setAddRole(newRole);
    // Reset role-specific fields so a previous role's data doesn't leak in
    setAddBrgy("");
    setAddDepartment("");
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(addPassword);
      toast.success("Password copied to clipboard.");
    } catch {
      toast.error("Could not copy. Select and copy manually.");
    }
  }

  async function submitAdd() {
    if (!addEmail.trim())          { toast.error("Email is required.");                return; }
    if (addName.trim().length < 2) { toast.error("Full name is required.");            return; }
    if (addPassword.length < 8)    { toast.error("Password must be at least 8 characters."); return; }

    const isBarangay  = isBarangayRole(addRole);
    const isVolunteer = addRole === "volunteer";

    setAddSubmitting(true);
    const res = await fetch("/api/admin/users/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:       addEmail.trim(),
        full_name:   addName.trim(),
        password:    addPassword,
        role:        addRole,
        barangay_id: isBarangay ? (addBrgy || null) : null,
        department:  isVolunteer ? (addDepartment.trim() || null) : null,
      }),
    });

    if (res.ok) {
      toast.success(`Account created for ${addName.trim()}.`);
      setAddOpen(false);
      fetchUsers();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to create account.");
    }
    setAddSubmitting(false);
  }

  // ── Edit dialog ───────────────────────────────────────────────────────────────

  function openEdit(user: User) {
    setEditUser(user);
    setEditName(user.full_name ?? "");
    setEditRole(user.role === "admin" ? "admin" : user.role);
    setEditBrgy(user.barangay_id ?? "");
    setEditStatus(user.status);

    // Build initial permission state: default all modules for this role to ON
    const modules = permissionModulesForRole(user.role);
    const defaults: Record<string, boolean> = {};
    for (const m of modules) defaults[m.key] = user.permissions[m.key] !== false;
    setEditPerms(defaults);
  }

  function togglePerm(key: string, val: boolean) {
    setEditPerms((prev) => ({ ...prev, [key]: val }));
  }

  // When role changes in edit dialog, reset permissions to all-on for new role
  function handleEditRoleChange(newRole: string) {
    setEditRole(newRole);
    const modules = permissionModulesForRole(newRole);
    const defaults: Record<string, boolean> = {};
    for (const m of modules) defaults[m.key] = true;
    setEditPerms(defaults);
  }

  async function saveEdit() {
    if (!editUser) return;
    if (editName.trim().length < 2) {
      toast.error("Full name must be at least 2 characters.");
      return;
    }
    setEditSaving(true);

    // Only send false values; true = default (saves space, same effect)
    const compactPerms: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(editPerms)) {
      if (!v) compactPerms[k] = false;
    }

    const res = await fetch(`/api/users/${editUser.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name:   editName.trim(),
        role:        editUser.role === "admin" ? undefined : editRole,
        barangay_id: isBarangayRole(editRole) ? (editBrgy || null) : null,
        status:      editStatus,
        permissions: compactPerms,
      }),
    });

    if (res.ok) {
      toast.success("User updated.");
      setUsers((prev) => prev.map((u) =>
        u.id === editUser.id
          ? { ...u, full_name: editName.trim(),
              role: (editUser.role === "admin" ? "admin" : editRole) as UserRole,
              barangay_id: isBarangayRole(editRole) ? (editBrgy || null) : null,
              status: editStatus, permissions: compactPerms }
          : u
      ));
      setEditUser(null);
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to save changes.");
    }
    setEditSaving(false);
  }

  // ── Password reset ────────────────────────────────────────────────────────────

  function openPasswordReset(user: User) {
    setPwUser(user);
    setPwMode("email");
    setPwNew(""); setPwConfirm(""); setPwAdmin("");
    setPwShowNew(false); setPwShowAdmin(false);
  }

  function closePasswordReset() {
    setPwUser(null);
    setPwNew(""); setPwConfirm(""); setPwAdmin("");
  }

  async function submitPasswordReset() {
    if (!pwUser) return;
    if (!pwAdmin) { toast.error("Enter your admin password to confirm."); return; }

    if (pwMode === "set") {
      if (pwNew.length < 8) { toast.error("New password must be at least 8 characters."); return; }
      if (pwNew !== pwConfirm) { toast.error("Passwords do not match."); return; }
    }

    setPwSubmitting(true);
    const res = await fetch(`/api/users/${pwUser.id}/password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_password: pwAdmin,
        mode:           pwMode,
        password:       pwMode === "set" ? pwNew : undefined,
      }),
    });

    if (res.ok) {
      if (pwMode === "set") toast.success(`New password set for ${pwUser.full_name}.`);
      else                  toast.success(`Password reset email sent to ${pwUser.email}.`);
      closePasswordReset();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to reset password.");
    }
    setPwSubmitting(false);
  }

  const editModules = permissionModulesForRole(editRole);
  const isAdminEdit = editUser?.role === "admin";

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: counts.total,     accent: "border-l-primary" },
          { label: "Active",      value: counts.active,    accent: "border-l-success" },
          { label: "Pending",     value: counts.pending,   accent: "border-l-warning" },
          { label: "Suspended",   value: counts.suspended, accent: "border-l-danger"  },
        ].map((c) => (
          <Card key={c.label} className={`border-border shadow-card border-l-4 ${c.accent}`}>
            <CardContent className="px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-heading text-foreground mt-0.5">
                {loading ? "—" : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users table */}
      <Card className="border-border shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg">User Accounts</CardTitle>
            <Button
              onClick={openAdd}
              className="bg-primary hover:bg-primary-dark text-white gap-2 self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" /> Add User
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name or email…"
                className="pl-9 focus-visible:ring-primary/30"
                value={search} onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 pl-8 pr-8 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                >
                  {ROLE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <select
                value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
              >
                {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-surface-alt/50">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">User</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Role</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden sm:table-cell">Barangay</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium hidden md:table-cell">Joined</th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading users…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">No users match your search.</td></tr>
                ) : filtered.map((user, i) => (
                  <tr key={user.id} className={`border-b border-border/60 transition-colors hover:bg-surface-alt/40 ${i % 2 !== 0 ? "bg-surface-alt/20" : ""}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-primary/15 text-primary font-bold">
                            {user.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{user.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4"><RoleBadge role={user.role} /></td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      {user.barangays?.name
                        ? <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" /> {user.barangays.name}
                          </span>
                        : <span className="text-xs text-muted-foreground/40">—</span>}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={user.status} /></td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(user.created_at)}</td>
                    <td className="py-3 px-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={actionId === user.id}
                          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {actionId === user.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            : <MoreHorizontal className="w-4 h-4 text-muted-foreground" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal truncate">
                              {user.full_name}
                            </DropdownMenuLabel>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openEdit(user)}>
                              <Pencil className="w-3.5 h-3.5" /> Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openPasswordReset(user)}>
                              <KeyRound className="w-3.5 h-3.5" /> Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 cursor-pointer">
                              <Mail className="w-3.5 h-3.5" /> Send Email
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            {user.status === "pending" && (
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-success"
                                onClick={() => updateStatus(user.id, "active", "approved")}
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Approve
                              </DropdownMenuItem>
                            )}
                            {user.status === "suspended" && (
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-info"
                                onClick={() => updateStatus(user.id, "active", "reactivated")}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" /> Reactivate
                              </DropdownMenuItem>
                            )}
                            {user.status === "active" && (
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-danger"
                                onClick={() => updateStatus(user.id, "suspended", "suspended")}
                              >
                                <XCircle className="w-3.5 h-3.5" /> Suspend
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
            <span>Showing {filtered.length} of {users.length} users</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Add User Dialog (direct create with temp password) ─────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-heading flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> Add New User
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email address</Label>
              <Input
                id="add-email" type="email" placeholder="user@dyci.edu.ph"
                value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                className="focus-visible:ring-primary/30"
              />
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Full name</Label>
              <Input
                id="add-name" placeholder="Juan dela Cruz"
                value={addName} onChange={(e) => setAddName(e.target.value)}
                className="focus-visible:ring-primary/30"
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label htmlFor="add-role">Role</Label>
              <select
                id="add-role" value={addRole}
                onChange={(e) => handleAddRoleChange(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
              >
                {EDITABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Barangay assignment — barangay roles */}
            {isBarangayRole(addRole) && (
              <div className="space-y-1.5">
                <Label htmlFor="add-brgy" className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Barangay assignment
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <select
                  id="add-brgy" value={addBrgy} onChange={(e) => setAddBrgy(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                >
                  <option value="">No barangay assignment</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            {/* Department / Course — volunteer */}
            {addRole === "volunteer" && (
              <div className="space-y-1.5">
                <Label htmlFor="add-vol-dept" className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Department / College
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <select
                  id="add-vol-dept" value={addDepartment} onChange={(e) => setAddDepartment(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                >
                  <option value="">Select a department…</option>
                  {DYCI_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Used for volunteer eligibility and aggregate reporting.</p>
              </div>
            )}

            {/* Temporary password */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label htmlFor="add-pw">Temporary password</Label>
                <button
                  type="button"
                  onClick={() => setAddPassword(generatePassword())}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
              </div>
              <div className="relative">
                <Input
                  id="add-pw"
                  type={addShowPw ? "text" : "password"}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="pr-20 focus-visible:ring-primary/30 font-mono text-sm"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setAddShowPw((v) => !v)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                    tabIndex={-1}
                    title={addShowPw ? "Hide" : "Show"}
                  >
                    {addShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded"
                    tabIndex={-1}
                    title="Copy password"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this password with the user securely. They can change it from their profile after first login.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-info/5 border border-info/20 text-xs text-info">
              The account will be created as <strong>active</strong> immediately — no email confirmation required.
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={submitAdd} disabled={addSubmitting || !addEmail || !addName || !addPassword}
              className="bg-primary hover:bg-primary-dark text-white"
            >
              {addSubmitting
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating…</>
                : <><UserPlus className="w-4 h-4 mr-2" /> Create Account</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-heading flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" /> Edit User
            </DialogTitle>
            {editUser && (
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-xs bg-primary/15 text-primary font-bold">
                    {editUser.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">{editUser.full_name}</p>
                  <p className="text-xs text-muted-foreground">{editUser.email}</p>
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">

            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Juan dela Cruz"
                className="focus-visible:ring-primary/30"
              />
            </div>

            {/* Role (locked for admins) */}
            <div className="space-y-1.5">
              <Label>Role</Label>
              {isAdminEdit ? (
                <div className="h-9 flex items-center px-3 rounded-xl border border-border bg-surface-alt text-sm text-muted-foreground">
                  System Administrator — role cannot be changed
                </div>
              ) : (
                <select
                  value={editRole} onChange={(e) => handleEditRoleChange(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                >
                  {EDITABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}
            </div>

            {/* Barangay */}
            {!isAdminEdit && isBarangayRole(editRole) && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Barangay assignment
                </Label>
                <select
                  value={editBrgy} onChange={(e) => setEditBrgy(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-transparent text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer appearance-none"
                >
                  <option value="">No barangay assignment</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Account Status</Label>
              <div className="flex gap-2">
                {(["active", "suspended"] as UserStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditStatus(s)}
                    className={`flex-1 h-9 rounded-xl border text-sm font-medium transition-all duration-150 capitalize ${
                      editStatus === s
                        ? s === "active"
                          ? "bg-success/10 border-success/30 text-success"
                          : "bg-danger/10 border-danger/30 text-danger"
                        : "border-border text-muted-foreground hover:bg-surface-alt"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Module permissions */}
            {!isAdminEdit && editModules.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Module Access</Label>
                  <span className="text-xs text-muted-foreground">
                    {Object.values(editPerms).filter(Boolean).length} / {editModules.length} enabled
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-1">
                  {editModules.map((m) => (
                    <ModuleToggle
                      key={m.key}
                      moduleKey={m.key}
                      label={m.label}
                      description={m.description}
                      enabled={editPerms[m.key] !== false}
                      onToggle={togglePerm}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Disabled modules are hidden from the user&apos;s sidebar. Dashboard is always visible.
                </p>
              </div>
            )}

            {isAdminEdit && (
              <div className="p-3 rounded-xl bg-warning/5 border border-warning/20 text-xs text-warning">
                Admin accounts are confined to infrastructure functions. They do not receive routine access to resident profiles or operational modules.
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button
              onClick={saveEdit} disabled={editSaving}
              className="bg-primary hover:bg-primary-dark text-white"
            >
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!pwUser} onOpenChange={(o) => { if (!o) closePasswordReset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Reset Password
            </DialogTitle>
            {pwUser && (
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-xs bg-primary/15 text-primary font-bold">
                    {pwUser.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">{pwUser.full_name}</p>
                  <p className="text-xs text-muted-foreground">{pwUser.email}</p>
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Mode selector */}
            <div className="space-y-1.5">
              <Label>Method</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPwMode("email")}
                  className={`h-9 rounded-xl border text-sm font-medium transition-all ${
                    pwMode === "email"
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-alt"
                  }`}
                >
                  Send Reset Email
                </button>
                <button
                  type="button"
                  onClick={() => setPwMode("set")}
                  className={`h-9 rounded-xl border text-sm font-medium transition-all ${
                    pwMode === "set"
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-alt"
                  }`}
                >
                  Set New Password
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {pwMode === "email"
                  ? "A password reset link will be sent to the user's email."
                  : "Directly set a new password. Share it with the user securely."}
              </p>
            </div>

            {/* New password fields — only when setting directly */}
            {pwMode === "set" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pw-new">New password</Label>
                  <div className="relative">
                    <Input
                      id="pw-new"
                      type={pwShowNew ? "text" : "password"}
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="pr-10 focus-visible:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setPwShowNew((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {pwShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pw-confirm">Confirm new password</Label>
                  <Input
                    id="pw-confirm"
                    type={pwShowNew ? "text" : "password"}
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className="focus-visible:ring-primary/30"
                  />
                </div>
              </>
            )}

            {/* Admin password — always required */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <Label htmlFor="pw-admin" className="flex items-center gap-1.5 text-warning">
                <AlertTriangle className="w-3.5 h-3.5" /> Confirm with your admin password
              </Label>
              <div className="relative">
                <Input
                  id="pw-admin"
                  type={pwShowAdmin ? "text" : "password"}
                  value={pwAdmin}
                  onChange={(e) => setPwAdmin(e.target.value)}
                  placeholder="Your current password"
                  className="pr-10 focus-visible:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setPwShowAdmin((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {pwShowAdmin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Required to verify this is you. Your password is never stored.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePasswordReset}>Cancel</Button>
            <Button
              onClick={submitPasswordReset}
              disabled={pwSubmitting || !pwAdmin || (pwMode === "set" && (!pwNew || !pwConfirm))}
              className="bg-primary hover:bg-primary-dark text-white"
            >
              {pwSubmitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : pwMode === "email"
                  ? <><Mail className="w-4 h-4 mr-2" /> Send Reset Email</>
                  : <><KeyRound className="w-4 h-4 mr-2" /> Update Password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
