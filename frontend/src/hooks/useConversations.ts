import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAppStore, ConversationRow, Message } from "../store/useAppStore";

export function useConversations() {
  const conversations = useAppStore((s) => s.conversations);
  const setConversations = useAppStore((s) => s.setConversations);
  const setThread = useAppStore((s) => s.setThread);
  const setActivePhone = useAppStore((s) => s.setActivePhone);
  const markUnread = useAppStore((s) => s.markUnread);

  const [loading, setLoading] = useState(false);

  const refreshConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/conversations");
      setConversations((data?.items || []) as ConversationRow[]);
    } finally {
      setLoading(false);
    }
  }, [setConversations]);

  const openConversation = useCallback(
    async (phone: string) => {
      setActivePhone(phone);
      markUnread(phone, false);
      const { data } = await api.get(`/conversations/${encodeURIComponent(phone)}`);
      const messages: Message[] = data?.messages || [];
      setThread(phone, messages);
    },
    [markUnread, setActivePhone, setThread]
  );

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  return { conversations, loading, refreshConversations, openConversation };
}

