import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import BulkComposer from "../components/BulkComposer";

export default function Dashboard() {
  const activity = useAppStore((s) => s.activity);
  const balance = useAppStore((s) => s.balance);
  const campaigns = useAppStore((s) => s.campaigns);
  const setContacts = useAppStore((s) => s.setContacts);
  const contacts = useAppStore((s) => s.contacts);

  const [stats, setStats] = useState<{ totalContacts: number; messagesToday: number; activeCampaigns: number }>({
    totalContacts: 0,
    messagesToday: 0,
    activeCampaigns: 0
  });

  const [openCompose, setOpenCompose] = useState(false);
  const defaultFrom = useMemo(() => "", []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [contactsRes, messagesRes, campaignsRes, balanceRes] = await Promise.allSettled([
        api.get("/contacts", { params: { page: 1, pageSize: 1 } }),
        api.get("/messages", { params: { page: 1, pageSize: 200 } }),
        api.get("/campaigns"),
        api.get("/balance")
      ]);

      if (cancelled) return;

      if (contactsRes.status === "fulfilled") {
        setStats((s) => ({ ...s, totalContacts: contactsRes.value.data?.total || 0 }));
      }
      if (messagesRes.status === "fulfilled") {
        const items = messagesRes.value.data?.items || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = items.filter((m: any) => new Date(m.createdAt).getTime() >= today.getTime()).length;
        setStats((s) => ({ ...s, messagesToday: count }));
      }
      if (campaignsRes.status === "fulfilled") {
        const items = campaignsRes.value.data?.items || [];
        const active = items.filter((c: any) => c.status === "running").length;
        setStats((s) => ({ ...s, activeCampaigns: active }));
      }
      if (balanceRes.status === "fulfilled") {
        useAppStore.getState().setBalance(balanceRes.value.data);
      }

      // preload a contact page for bulk composer selection
      try {
        const { data } = await api.get("/contacts", { params: { page: 1, pageSize: 200 } });
        setContacts(data?.items || []);
      } catch {}
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaigns.length, setContacts]);

  const statCard = (label: string, value: string) => (
    <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Real-time ops dashboard</div>
          <div className="text-xl font-semibold">Dashboard</div>
        </div>
        <button
          onClick={() => setOpenCompose(true)}
          className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20"
        >
          Quick compose
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {statCard("Total Contacts", String(stats.totalContacts))}
        {statCard("Messages Today", String(stats.messagesToday))}
        {statCard("Credits Balance", balance ? `${balance.balance ?? "—"} ${balance.currency ?? ""}`.trim() : "—")}
        {statCard("Active Campaigns", String(stats.activeCampaigns))}
      </div>

      <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Socket-driven</div>
            <div className="font-semibold">Recent activity</div>
          </div>
          <div className="text-xs text-slate-500">Last 50 events</div>
        </div>
        <div className="divide-y divide-slate-800">
          {activity.map((a, idx) => (
            <div key={idx} className="px-4 py-3 text-sm">
              {a.type === "inbound" && (
                <div>
                  <span className="text-accent-400 font-mono">{a.phone}</span> <span className="text-slate-400">inbound:</span>{" "}
                  <span className="font-mono text-slate-200">{a.text}</span>
                </div>
              )}
              {a.type === "status" && (
                <div>
                  <span className="text-slate-400">Message</span> <span className="font-mono text-slate-200">{a.messageId}</span>{" "}
                  <span className="text-slate-400">status:</span> <span className="text-accent-400">{a.status}</span>
                </div>
              )}
              {a.type === "campaign" && (
                <div>
                  <span className="text-slate-400">Campaign</span> <span className="font-mono text-slate-200">{a.campaignId}</span>{" "}
                  <span className="text-slate-400">progress:</span>{" "}
                  <span className="text-accent-400">
                    {a.sentCount}/{a.total}
                  </span>
                </div>
              )}
            </div>
          ))}
          {!activity.length && <div className="px-4 py-10 text-center text-slate-400">Waiting for events…</div>}
        </div>
      </div>

      <BulkComposer open={openCompose} onClose={() => setOpenCompose(false)} contacts={contacts} defaultFromNumber={defaultFrom} />
    </div>
  );
}

