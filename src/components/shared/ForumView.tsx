"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare, Plus, Loader2, Search, Pin, Lock, Trash2, ArrowLeft, Send,
  MessageCircle, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Author = { id: string; full_name: string; role: string };

interface ThreadSummary {
  id:         string;
  title:      string;
  body:       string;
  category:   string;
  pinned:     boolean;
  locked:     boolean;
  created_at: string;
  author:     Author | null;
  post_count: number;
}

interface Post {
  id:         string;
  body:       string;
  created_at: string;
  author:     Author | null;
}

interface ThreadDetail extends ThreadSummary {
  posts: Post[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "general",      label: "General",       color: "#6B5B3E" },
  { value: "programs",     label: "Programs",      color: "#4A7C59" },
  { value: "schedule",     label: "Schedule",      color: "#5B7FA5" },
  { value: "barangay",     label: "Barangay",      color: "#C4A96A" },
  { value: "announcement", label: "Announcement",  color: "#B8860B" },
  { value: "question",     label: "Question",      color: "#9B3B3B" },
];

const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const ROLE_LABEL: Record<string, string> = {
  paraya_officer:    "Officer",
  volunteer:         "Volunteer",
  barangay_official: "Barangay",
  admin:             "Admin",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const d        = new Date(iso);
  const diffMs   = Date.now() - d.getTime();
  const diffMin  = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay  = Math.floor(diffHour / 24);
  if (diffMin < 1)    return "Just now";
  if (diffMin < 60)   return `${diffMin}m ago`;
  if (diffHour < 24)  return `${diffHour}h ago`;
  if (diffDay  < 7)   return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ForumViewProps {
  isModerator: boolean;          // can pin/lock/delete-any
  currentUserId: string | null;  // for "is this my post" checks
}

export function ForumView({ isModerator, currentUserId }: ForumViewProps) {
  const [threads, setThreads]     = useState<ThreadSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState<string>("");

  // Detail view
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [detail, setDetail]             = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reply box
  const [replyText, setReplyText]   = useState("");
  const [replying, setReplying]     = useState(false);

  // New-thread dialog
  const [dlg, setDlg]               = useState(false);
  const [form, setForm]             = useState({ title: "", body: "", category: "general" });
  const [creating, setCreating]     = useState(false);

  const [busyId, setBusyId]         = useState<string | null>(null);

  // ── Fetch list ───────────────────────────────────────────────────────────

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/forum/threads?${params}`);
    if (res.ok) {
      const j = await res.json();
      setThreads(j.data ?? []);
    } else {
      toast.error("Failed to load threads.");
    }
    setLoading(false);
  }, [category, search]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ── Detail view ──────────────────────────────────────────────────────────

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setReplyText("");
    const res = await fetch(`/api/forum/threads/${id}`);
    if (res.ok) {
      const j = await res.json();
      setDetail(j.data ?? null);
    } else {
      toast.error("Failed to load thread.");
    }
    setDetailLoading(false);
  }, []);

  function closeThread() {
    setSelectedId(null);
    setDetail(null);
    fetchThreads();
  }

  // ── Create thread ────────────────────────────────────────────────────────

  function openCreate() {
    setForm({ title: "", body: "", category: category || "general" });
    setDlg(true);
  }

  async function createThread() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/forum/threads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), body: form.body.trim(), category: form.category }),
    });
    if (res.ok) {
      toast.success("Thread created.");
      setDlg(false);
      fetchThreads();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to create thread.");
    }
    setCreating(false);
  }

  // ── Reply ────────────────────────────────────────────────────────────────

  async function postReply() {
    if (!detail) return;
    if (!replyText.trim()) return;
    setReplying(true);
    const res = await fetch(`/api/forum/threads/${detail.id}/posts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyText.trim() }),
    });
    if (res.ok) {
      const j = await res.json();
      setDetail((prev) => prev ? { ...prev, posts: [...prev.posts, j.data] } : prev);
      setReplyText("");
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Failed to post reply.");
    }
    setReplying(false);
  }

  // ── Moderation / delete ─────────────────────────────────────────────────

  async function deleteThread(id: string) {
    if (!confirm("Delete this thread and all its replies?")) return;
    setBusyId(id);
    const res = await fetch(`/api/forum/threads/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Thread deleted.");
      if (selectedId === id) closeThread();
      setThreads((prev) => prev.filter((t) => t.id !== id));
    } else {
      toast.error("Failed to delete.");
    }
    setBusyId(null);
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this reply?")) return;
    setBusyId(id);
    const res = await fetch(`/api/forum/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDetail((prev) => prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== id) } : prev);
    } else {
      toast.error("Failed to delete reply.");
    }
    setBusyId(null);
  }

  async function togglePin(t: ThreadSummary) {
    setBusyId(t.id);
    const res = await fetch(`/api/forum/threads/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !t.pinned }),
    });
    if (res.ok) {
      toast.success(t.pinned ? "Thread unpinned." : "Thread pinned.");
      fetchThreads();
    } else {
      toast.error("Failed to update.");
    }
    setBusyId(null);
  }

  async function toggleLock(t: ThreadSummary) {
    setBusyId(t.id);
    const res = await fetch(`/api/forum/threads/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !t.locked }),
    });
    if (res.ok) {
      toast.success(t.locked ? "Thread unlocked." : "Thread locked.");
      fetchThreads();
      if (detail?.id === t.id) setDetail({ ...detail, locked: !t.locked });
    } else {
      toast.error("Failed to update.");
    }
    setBusyId(null);
  }

  // ── Render: detail view ─────────────────────────────────────────────────

  if (selectedId) {
    return (
      <div className="space-y-4">
        <button
          onClick={closeThread}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to threads
        </button>

        {detailLoading ? (
          <Card className="border-border shadow-card">
            <CardContent className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading thread…
            </CardContent>
          </Card>
        ) : !detail ? (
          <Card className="border-border shadow-card">
            <CardContent className="py-16 text-center text-muted-foreground">
              Thread not found or deleted.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Opening post */}
            <Card className="border-border shadow-card">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs">
                        {initials(detail.author?.full_name ?? "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{detail.author?.full_name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABEL[detail.author?.role ?? ""] ?? "User"} · {relativeTime(detail.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {detail.pinned && <Pin className="w-3.5 h-3.5 text-warning" />}
                    {detail.locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Badge
                      className="text-[10px] capitalize"
                      style={{
                        background: `${CATEGORY_META[detail.category]?.color ?? "#6B5B3E"}18`,
                        color:      CATEGORY_META[detail.category]?.color ?? "#6B5B3E",
                        border:    `1px solid ${CATEGORY_META[detail.category]?.color ?? "#6B5B3E"}30`,
                      }}
                    >
                      {CATEGORY_META[detail.category]?.label ?? detail.category}
                    </Badge>
                  </div>
                </div>
                <h2 className="font-heading text-xl font-bold text-foreground mb-2">{detail.title}</h2>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{detail.body}</p>

                {/* Moderation row */}
                {(isModerator || detail.author?.id === currentUserId) && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                    {isModerator && (
                      <>
                        <button
                          onClick={() => togglePin(detail)}
                          disabled={busyId === detail.id}
                          className="text-xs text-muted-foreground hover:text-warning flex items-center gap-1 transition-colors"
                        >
                          <Pin className="w-3 h-3" /> {detail.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          onClick={() => toggleLock(detail)}
                          disabled={busyId === detail.id}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          <Lock className="w-3 h-3" /> {detail.locked ? "Unlock" : "Lock"}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => deleteThread(detail.id)}
                      disabled={busyId === detail.id}
                      className="text-xs text-muted-foreground hover:text-danger flex items-center gap-1 transition-colors ml-auto"
                    >
                      <Trash2 className="w-3 h-3" /> Delete thread
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Replies */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-1">
                {detail.posts.length} {detail.posts.length === 1 ? "Reply" : "Replies"}
              </p>
              {detail.posts.map((p) => {
                const canDelete = isModerator || p.author?.id === currentUserId;
                return (
                  <div key={p.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface-alt/30">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-[10px]">
                        {initials(p.author?.full_name ?? "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium text-sm text-foreground">{p.author?.full_name ?? "Unknown"}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {ROLE_LABEL[p.author?.role ?? ""] ?? "User"}
                        </span>
                        <span className="text-xs text-muted-foreground">· {relativeTime(p.created_at)}</span>
                        {canDelete && (
                          <button
                            onClick={() => deletePost(p.id)}
                            disabled={busyId === p.id}
                            className="ml-auto text-muted-foreground hover:text-danger transition-colors"
                            aria-label="Delete reply"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{p.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply composer */}
            <Card className="border-border shadow-card">
              <CardContent className="p-4">
                {detail.locked && !isModerator ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> This thread is locked. Only moderators can reply.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      placeholder="Write a reply…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="focus-visible:ring-primary/30 resize-none text-sm"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        onClick={postReply}
                        disabled={replying || !replyText.trim()}
                        size="sm"
                        className="bg-primary hover:bg-primary-dark text-white gap-1.5"
                      >
                        {replying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Post Reply
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // ── Render: list view ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" /> Discussion Forum
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ask questions, share experiences, and coordinate with the PARAYA community.
        </p>
      </div>

      {/* Filters + new thread */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search threads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 w-56 focus-visible:ring-primary/30"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 pl-8 pr-8 text-sm cursor-pointer"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={openCreate}
          size="sm"
          className="bg-primary hover:bg-primary-dark text-white gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> New Thread
        </Button>
      </div>

      {/* Threads list */}
      <Card className="border-border shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading threads…
            </div>
          ) : threads.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <MessageSquare className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm">No threads yet. Start the first discussion.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {threads.map((t) => (
                <li
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={cn(
                    "p-4 cursor-pointer transition-colors hover:bg-surface-alt/40",
                    t.pinned && "bg-warning/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-9 h-9 flex-shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs">
                        {initials(t.author?.full_name ?? "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {t.pinned && <Pin className="w-3 h-3 text-warning flex-shrink-0" />}
                        {t.locked && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        <p className="font-medium text-sm text-foreground truncate">{t.title}</p>
                        <Badge
                          className="text-[10px] capitalize flex-shrink-0"
                          style={{
                            background: `${CATEGORY_META[t.category]?.color ?? "#6B5B3E"}18`,
                            color:      CATEGORY_META[t.category]?.color ?? "#6B5B3E",
                            border:    `1px solid ${CATEGORY_META[t.category]?.color ?? "#6B5B3E"}30`,
                          }}
                        >
                          {CATEGORY_META[t.category]?.label ?? t.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">{t.body}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{t.author?.full_name ?? "Unknown"}</span>
                        <span>·</span>
                        <span>{relativeTime(t.created_at)}</span>
                        <span className="flex items-center gap-1 ml-auto">
                          <MessageCircle className="w-3 h-3" />
                          {t.post_count} {t.post_count === 1 ? "reply" : "replies"}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── New Thread Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dlg} onOpenChange={(o) => { if (!o) setDlg(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Start a Thread
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ft-title">Title</Label>
              <Input
                id="ft-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Tips for surveying beneficiaries"
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ft-cat">Category</Label>
              <select
                id="ft-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-9 px-3 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ft-body">Body</Label>
              <Textarea
                id="ft-body"
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Share details, questions, or context here…"
                className="focus-visible:ring-primary/30 resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Cancel</Button>
            <Button onClick={createThread} disabled={creating} className="bg-primary hover:bg-primary-dark text-white">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Thread"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
