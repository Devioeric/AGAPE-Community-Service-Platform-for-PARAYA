"use client";

import { AssistantChatPage } from "@/components/shared/AssistantChatPage";

const SUGGESTED = [
  "How do I create a new program proposal?",
  "What are the SDG alignment requirements?",
  "How do volunteers log their hours?",
  "What is the approval pipeline for proposals?",
  "How do I distribute donations to barangays?",
];

export default function ChatbotPage() {
  return (
    <AssistantChatPage
      suggestions={SUGGESTED}
      intro="Ask me anything about proposals, programs, volunteers, donations, or how to use the platform."
      topicPickerId="officer-chatbot-topic"
    />
  );
}
