import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import BulkComposer from "../components/BulkComposer";
import ApiStatus from "../components/ApiStatus";

export default function Dashboard() {
  const activity = useAppStore((s) => s.activity);
  const balance = useAppStore((s) => s.balance);
  const campaigns = useAppStore((s) => s.campaigns);
  const campaignProgress = useAppStore((s) => s.campaignProgress);
  const setContacts = useAppStore((s) => s.setContacts);
  const contacts = useAppStore((s) => s.contacts);

  const [stats, setStats] = useState<{ totalContacts: number; messagesToday: number; activeCampaigns: number }>({
    totalContacts: 0,
    messagesToday: 0,
    activeCampaigns: 0
  });

  const [openCompose, setOpenCompose] = useState(false);
  const defaultFrom = useMemo(() => "", []);

  // Quick test state
  const [quickTestOpen, setQuickTestOpen] = useState(false);
  const [qtBusinessName, setQtBusinessName] = useState("Test Barber Shop");
  const [qtCity, setQtCity] = useState("Austin, TX");
  const [qtPhone, setQtPhone] = useState("+14374647338");
  const [qtLoading, setQtLoading] = useState(false);
  const [qtResult, setQtResult] = useState<{ success?: boolean; siteUrl?: string; error?: string } | null>(null);

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

  async function runQuickTest() {
    setQtLoading(true);
    setQtResult(null);
    try {
      const { data } = await api.post("/campaigns/quick-test", {
        businessName: qtBusinessName,
        city: qtCity,
        phone: qtPhone,
      });
      setQtResult({ success: true, siteUrl: data.siteUrl });
    } catch (e: any) {
      setQtResult({ success: false, error: e?.response?.data?.error || e?.message || "Test failed" });
    } finally {
      setQtLoading(false);
    }
  }

  const statCard = (label: string, value: string) => (
    <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );

  const recentCampaigns = useMemo(() => {
    return [...campaigns]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Real-time ops dashboard</div>
          <div className="text-xl font-semibold">Dashboard</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQuickTestOpen(true)}
            className="px-4 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-800 text-slate-300 hover:bg-slate-900 transition-colors"
          >
            Quick Test
          </button>
          <button
            onClick={() => setOpenCompose(true)}
            className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20"
          >
            Quick compose
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {statCard("Total Contacts", String(stats.totalContacts))}
        {statCard("Messages Today", String(stats.messagesToday))}
        {statCard("Credits Balance", balance ? `${balance.balance ?? "—"} ${balance.currency ?? ""}`.trim() : "—")}
        {statCard("Active Campaigns", String(stats.activeCampaigns))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Recent campaigns */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent campaigns */}
          <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">Recent</div>
                <div className="font-semibold">Campaigns</div>
              </div>
              <Link
                to="/campaigns"
                className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="divide-y divide-slate-800">
              {recentCampaigns.map((c) => {
                const p = campaignProgress[c.id];
                const sentCount = p?.sentCount ?? c.sentCount;
                const total = p?.total ?? c.totalCount;
                const pct = total ? Math.min(100, Math.round((sentCount / total) * 100)) : 0;
                return (
                  <div key={c.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="font-medium text-slate-200">{c.name}</div>
                      <span className={`px-2 py-0.5 rounded-md ring-1 text-xs ${
                        c.status === "running" ? "bg-accent-500/10 ring-accent-500/30 text-accent-400" :
                        c.status === "completed" ? "bg-emerald-500/10 ring-emerald-500/20 text-emerald-400" :
                        "bg-slate-900/40 ring-slate-800 text-slate-300"
                      }`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-900 ring-1 ring-slate-800 overflow-hidden">
                        <div className="h-full bg-accent-500/60 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {sentCount}/{total}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!recentCampaigns.length && (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">
                  No campaigns yet.{" "}
                  <Link to="/campaigns/new" className="text-accent-400 hover:underline">Create one →</Link>
                </div>
              )}
            </div>
          </div>

          {/* Activity feed */}
          <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">Socket-driven</div>
                <div className="font-semibold">Activity Feed</div>
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
        </div>

        {/* Right: API Status */}
        <div className="space-y-4">
          <ApiStatus />
        </div>
      </div>

      {/* Quick Test Modal */}
      {quickTestOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-950 ring-1 ring-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-slate-400">Single lead test</div>
                <div className="text-lg font-semibold">Quick Test</div>
              </div>
              <button
                onClick={() => { setQuickTestOpen(false); setQtResult(null); }}
                className="px-3 py-1.5 text-sm rounded-md bg-slate-900/60 ring-1 ring-slate-800 hover:bg-slate-900"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Generate a landing page and send one SMS to test the full pipeline without creating a campaign.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Business Name</label>
                <input
                  value={qtBusinessName}
                  onChange={(e) => setQtBusinessName(e.target.value)}
                  className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">City</label>
                <input
                  value={qtCity}
                  onChange={(e) => setQtCity(e.target.value)}
                  className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Phone (recipient)</label>
                <input
                  value={qtPhone}
                  onChange={(e) => setQtPhone(e.target.value)}
                  className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>
            </div>
            <button
              onClick={() => void runQuickTest()}
              disabled={qtLoading || !qtBusinessName.trim() || !qtCity.trim() || !qtPhone.trim()}
              className="w-full mt-4 py-2.5 rounded-lg text-sm font-medium bg-accent-500 text-slate-950 hover:bg-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {qtLoading ? "Running test..." : "Run Quick Test"}
            </button>
            {qtResult && (
              <div className={`mt-3 rounded-md p-3 text-sm ${qtResult.success ? "bg-emerald-500/10 ring-1 ring-emerald-500/20 text-emerald-300" : "bg-red-500/10 ring-1 ring-red-500/20 text-red-300"}`}>
                {qtResult.success ? (
                  <div>
                    <div className="font-semibold mb-1">Test successful!</div>
                    {qtResult.siteUrl && (
                      <div>
                        Site: <a href={qtResult.siteUrl} target="_blank" rel="noopener noreferrer" className="underline">{qtResult.siteUrl}</a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>{qtResult.error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <BulkComposer open={openCompose} onClose={() => setOpenCompose(false)} contacts={contacts} defaultFromNumber={defaultFrom} />
    </div>
  );
}
