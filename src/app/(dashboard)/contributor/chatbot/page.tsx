"use client";

import { AssistantChatPage } from "@/components/shared/AssistantChatPage";

const SUGGESTED = [
  "What is the status of my proposals?",
  "Which of my proposals need revisions, and what did the Officer say?",
  "How do I submit a proposal for PARAYA review?",
  "Which SDGs can my proposal align with?",
  "What makes a proposal ready for approval?",
];

export default function ContributorChatbotPage() {
  return (
    <AssistantChatPage
      suggestions={SUGGESTED}
      intro="Ask about your proposals, Officer feedback, or how the review process works. I only see proposals you created."
      topicPickerId="contributor-chatbot-topic"
    />
  );
}
