"use client";

import { useMemo } from "react";
import { getAvailableModules } from "@/lib/ai/chatbot-modules";
import type { PermissionOverrides } from "@/lib/auth/capabilities";

interface Props {
  role: string;
  permissions?: PermissionOverrides;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

export function ChatbotTopicPicker({ role, permissions, value, onChange, disabled, id = "chatbot-topic" }: Props) {
  const modules = useMemo(() => getAvailableModules(role, permissions), [role, permissions]);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[12px] text-muted-foreground shrink-0">Topic</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="flex-1 text-xs bg-surface-alt/50 border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 cursor-pointer"
      >
        <option value="">Auto-detect</option>
        {modules.map((module) => <option key={module.key} value={module.key}>{module.label}</option>)}
      </select>
      {value && (
        <button type="button" onClick={() => onChange("")} disabled={disabled} className="text-[12px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50" title="Clear topic filter">
          Clear
        </button>
      )}
    </div>
  );
}
