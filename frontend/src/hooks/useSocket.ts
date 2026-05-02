import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAppStore, Message } from "../store/useAppStore";
import { api } from "../api/client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

export function useSocket() {
  const setSocketConnected = useAppStore((s) => s.setSocketConnected);
  const setBalance = useAppStore((s) => s.setBalance);
  const pushActivity = useAppStore((s) => s.pushActivity);
  const upsertMessage = useAppStore((s) => s.upsertMessage);
  const updateMessageStatus = useAppStore((s) => s.updateMessageStatus);
  const updateCampaignProgress = useAppStore((s) => s.updateCampaignProgress);
  const markUnread = useAppStore((s) => s.markUnread);
  const activePhone = useAppStore((s) => s.activePhone);
  const conversations = useAppStore((s) => s.conversations);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"]
    });
    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.io.on("reconnect", async () => {
      // On reconnect: fetch last 50 messages then re-subscribe
      if (!activePhone) return;
      const row = conversations.find((c) => c.phone === activePhone);
      if (!row) return;
      try {
        const { data } = await api.get("/messages", { params: { contactId: row.contactId, pageSize: 50, page: 1 } });
        const items: Message[] = (data?.items || []).slice().reverse();
        useAppStore.getState().setThread(activePhone, items);
        socket.emit("join:conversation", activePhone);
      } catch {}
    });

    socket.on("balance:update", (b) => {
      setBalance(b);
    });

    socket.on("campaign:progress", (p) => {
      updateCampaignProgress(p.campaignId, {
        sentCount: p.sentCount,
        total: p.total,
        failedCount: p.failedCount,
        deliveredCount: p.deliveredCount,
        status: p.status
      });
      pushActivity({ type: "campaign", at: Date.now(), campaignId: p.campaignId, sentCount: p.sentCount, total: p.total });
    });

    socket.on("message:received", (msg: Message) => {
      const phone = msg?.contact?.phone || (msg.direction === "INBOUND" ? msg.fromNumber : msg.toNumber);
      if (!phone) return;
      upsertMessage(phone, msg);
      pushActivity({ type: "inbound", at: Date.now(), phone, text: msg.body });
      if (useAppStore.getState().activePhone !== phone) markUnread(phone, true);
    });

    socket.on("message:status", (p: { messageId: string; status: Message["status"] }) => {
      const state = useAppStore.getState();
      for (const phone of Object.keys(state.messagesByPhone)) {
        updateMessageStatus(phone, p.messageId, p.status);
      }
      pushActivity({ type: "status", at: Date.now(), messageId: p.messageId, status: p.status });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhone, conversations.length]);

  return socketRef;
}

