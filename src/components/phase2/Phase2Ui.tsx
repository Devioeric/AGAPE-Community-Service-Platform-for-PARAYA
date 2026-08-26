"use client";

import type { ReactNode } from "react";

export async function phase2Api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload.data as T;
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export function Phase2Notice({ message, tone = "info" }: { message: string; tone?: "info" | "error" | "success" }) {
  const color = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-900";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border p-3 text-sm ${color}`}>{message}</div>;
}

export function Panel({ title, description, actions, children, testId }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return <section data-testid={testId} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-slate-600">{description}</p>}</div>{actions}</header>
    {children}
  </section>;
}

export function StatusPill({ value }: { value: string | null | undefined }) {
  return <span className="inline-flex rounded-full border bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">{value?.replaceAll("_", " ") ?? "not configured"}</span>;
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value ?? "—"}</dd></div>;
}

export function Empty({ children = "No records are available." }: { children?: ReactNode }) {
  return <div className="rounded-md border border-dashed p-5 text-center text-sm text-slate-500">{children}</div>;
}

export const inputClass = "h-10 w-full rounded-md border bg-white px-3 text-sm";
export const textareaClass = "min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm";
export const primaryButton = "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
