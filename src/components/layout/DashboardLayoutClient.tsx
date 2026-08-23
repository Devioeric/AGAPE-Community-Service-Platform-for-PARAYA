"use client";

import { ChatbotWidget } from "@/components/shared/ChatbotWidget";

interface Props {
  children: React.ReactNode;
  role: string;
}

export function DashboardLayoutClient({ children, role }: Props) {
  return (
    <>
      {children}
      <ChatbotWidget role={role} />
    </>
  );
}
