"use client";

import { ChatbotWidget } from "@/components/shared/ChatbotWidget";
import { useDashboardActor } from "@/components/layout/DashboardActorContext";
import { hasCapability } from "@/lib/auth/capabilities";

interface Props {
  children: React.ReactNode;
  role: string;
}

export function DashboardLayoutClient({ children }: Props) {
  const actor = useDashboardActor();
  return (
    <>
      {children}
      {hasCapability(actor.role, actor.permissions, "ai.assist") && <ChatbotWidget role={actor.role} permissions={actor.permissions} />}
    </>
  );
}
