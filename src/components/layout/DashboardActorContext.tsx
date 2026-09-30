"use client";

import { createContext, useContext } from "react";

export type DashboardActor = { role: string; permissions: Record<string, boolean> };
const DashboardActorContext = createContext<DashboardActor>({ role: "", permissions: {} });

/** Presentation only. APIs must independently authorize the current account. */
export function DashboardActorProvider({ actor, children }: { actor: DashboardActor; children: React.ReactNode }) {
  return <DashboardActorContext.Provider value={actor}>{children}</DashboardActorContext.Provider>;
}

export function useDashboardActor() { return useContext(DashboardActorContext); }
