"use client";

import { AssistantChatPage } from "@/components/shared/AssistantChatPage";

const SUGGESTED = [
  "Which of our community needs were returned for revision, and why?",
  "Which of our submitted needs are still awaiting PARAYA review?",
  "How do I submit a community need for our barangay?",
  "What skills and assets have we recorded?",
  "Where can I read my barangay's Community Profile?",
];

export default function BarangayChatbotPage() {
  return (
    <AssistantChatPage
      suggestions={SUGGESTED}
      intro="Ask about your barangay's community needs, profiling, skills and assets, or how to use the platform. I only see your own barangay's records."
      topicPickerId="barangay-chatbot-topic"
    />
  );
}
