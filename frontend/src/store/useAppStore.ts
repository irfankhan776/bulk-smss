import { create } from "zustand";

export type Contact = {
  id: string;
  phone: string;
  name: string | null;
  tags: string[];
};

export type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  status: "queued" | "sent" | "delivered" | "failed" | "received";
  telnyxMessageId?: string | null;
  fromNumber: string;
  toNumber: string;
  contactId: string;
  campaignId?: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: Contact;
};

export type ConversationRow = {
  contactId: string;
  phone: string;
  name: string | null;
  tags: string[];
  messageId: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  fromNumber: string;
  toNumber: string;
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  body: string;
  status: "draft" | "running" | "paused" | "completed" | "failed";
  scheduledAt: string | null;
  completedAt: string | null;
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
};

type Balance = { balance: string | number | null; currency: string | null };

type ActivityItem =
  | { type: "inbound"; at: number; phone: string; text: string }
  | { type: "status"; at: number; messageId: string; status: string }
  | { type: "campaign"; at: number; campaignId: string; sentCount: number; total: number };

type State = {
  socketConnected: boolean;
  balance: Balance | null;
  activity: ActivityItem[];
  defaultFromNumber: string | null;

  conversations: ConversationRow[];
  unreadPhones: Record<string, boolean>;
  activePhone: string | null;

  contacts: Contact[];
  campaigns: Campaign[];
  campaignProgress: Record<string, { sentCount: number; total: number; failedCount?: number; deliveredCount?: number; status?: string }>;

  messagesByPhone: Record<string, Message[]>;

  setSocketConnected: (v: boolean) => void;
  setBalance: (b: Balance) => void;
  pushActivity: (item: ActivityItem) => void;
  setDefaultFromNumber: (n: string | null) => void;

  setConversations: (rows: ConversationRow[]) => void;
  setActivePhone: (phone: string | null) => void;
  markUnread: (phone: string, unread: boolean) => void;

  setContacts: (items: Contact[]) => void;
  setCampaigns: (items: Campaign[]) => void;
  updateCampaignProgress: (campaignId: string, p: { sentCount: number; total: number; failedCount?: number; deliveredCount?: number; status?: string }) => void;

  upsertMessage: (phone: string, message: Message) => void;
  setThread: (phone: string, messages: Message[]) => void;
  updateMessageStatus: (phone: string, messageId: string, status: Message["status"]) => void;
};

export const useAppStore = create<State>((set, get) => ({
  socketConnected: false,
  balance: null,
  activity: [],
  defaultFromNumber: null,

  conversations: [],
  unreadPhones: {},
  activePhone: null,

  contacts: [],
  campaigns: [],
  campaignProgress: {},

  messagesByPhone: {},

  setSocketConnected: (v) => set({ socketConnected: v }),
  setBalance: (b) => set({ balance: b }),
  pushActivity: (item) =>
    set((s) => ({
      activity: [item, ...s.activity].slice(0, 50)
    })),
  setDefaultFromNumber: (n) => set({ defaultFromNumber: n }),

  setConversations: (rows) => set({ conversations: rows }),
  setActivePhone: (phone) => set({ activePhone: phone }),
  markUnread: (phone, unread) =>
    set((s) => ({
      unreadPhones: { ...s.unreadPhones, [phone]: unread }
    })),

  setContacts: (items) => set({ contacts: items }),
  setCampaigns: (items) => set({ campaigns: items }),
  updateCampaignProgress: (campaignId, p) =>
    set((s) => ({
      campaignProgress: { ...s.campaignProgress, [campaignId]: p }
    })),

  upsertMessage: (phone, message) => {
    const cur = get().messagesByPhone[phone] || [];
    const idx = cur.findIndex((m) => m.id === message.id);
    const next = idx >= 0 ? [...cur.slice(0, idx), message, ...cur.slice(idx + 1)] : [...cur, message];
    next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    set((s) => ({ messagesByPhone: { ...s.messagesByPhone, [phone]: next } }));
  },
  setThread: (phone, messages) =>
    set((s) => ({
      messagesByPhone: { ...s.messagesByPhone, [phone]: messages }
    })),
  updateMessageStatus: (phone, messageId, status) => {
    const cur = get().messagesByPhone[phone] || [];
    const idx = cur.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const updated = { ...cur[idx], status };
    const next = [...cur.slice(0, idx), updated, ...cur.slice(idx + 1)];
    set((s) => ({ messagesByPhone: { ...s.messagesByPhone, [phone]: next } }));
  }
}));

