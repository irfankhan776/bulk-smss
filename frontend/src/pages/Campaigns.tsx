import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { api } from "../api/client";
import { useCampaigns } from "../hooks/useCampaigns";
import { useAppStore, Campaign, Contact } from "../store/useAppStore";
import BulkComposer from "../components/BulkComposer";

export default function Campaigns() {
  const { campaigns, refresh } = useCampaigns();
  const progress = useAppStore((s) => s.campaignProgress);
  const contacts = useAppStore((s) => s.contacts);
  const setContacts = useAppStore((s) => s.setContacts);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get("/contacts", { params: { page: 1, pageSize: 200 } });
        setContacts((data?.items || []) as Contact[]);
      } catch {}
    })();
  }, [setContacts]);

  const rows = useMemo(() => {
    return campaigns.map((c) => {
      const p = progress[c.id];
      const sentCount = p?.sentCount ?? c.sentCount;
      const total = p?.total ?? c.totalCount;
      const pct = total ? Math.min(100, Math.round((sentCount / total) * 100)) : 0;
      return { c, pct, sentCount, total, status: p?.status || c.status };
    });
  }, [campaigns, progress]);

  async function openDetail(c: Campaign) {
    setSelected(c);
    const { data } = await api.get(`/campaigns/${c.id}`);
    setDetail(data?.campaign || null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Socket-driven progress</div>
          <div className="text-xl font-semibold">Campaigns</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refresh()} className="px-3 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-800 hover:bg-slate-900">
            Refresh
          </button>
          <Link
            to="/campaigns/new"
            className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20"
          >
            New Campaign
          </Link>
          <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-800 text-slate-300 hover:bg-slate-900">
            Bulk SMS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/80 ring-1 ring-slate-800">
              <tr className="text-slate-300">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map(({ c, pct, sentCount, total, status }) => (
                <tr key={c.id} className={clsx("hover:bg-slate-900/40 cursor-pointer", selected?.id === c.id && "bg-accent-500/5")} onClick={() => void openDetail(c)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{c.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-1 rounded-md ring-1 text-xs", status === "running" ? "bg-accent-500/10 ring-accent-500/30 text-accent-400" : "bg-slate-900/40 ring-slate-800 text-slate-300")}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-slate-900 ring-1 ring-slate-800 overflow-hidden">
                        <div className="h-full bg-accent-500/60" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {sentCount}/{total}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                    No campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-slate-400">Campaign detail</div>
            {detail?.source && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 ring-1 ring-slate-700">
                {detail.source === "google_maps" ? "Google Maps" : "CSV Upload"}
              </span>
            )}
          </div>
          <div className="text-lg font-semibold">{detail?.name || "Select a campaign"}</div>
          {detail && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg bg-slate-950/40 ring-1 ring-slate-800 p-3">
                <div className="text-xs text-slate-500">Outreach Message</div>
                <div className="mt-1 font-mono text-sm whitespace-pre-wrap">{detail.body}</div>
                {detail.niche && (
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className="text-slate-500">Niche: <span className="text-slate-300">{detail.niche}</span></span>
                    <span className="text-slate-500">Template: <span className="text-slate-300">{detail.template}</span></span>
                    <span className="text-slate-500">Delay: <span className="text-slate-300">{detail.delaySeconds}s</span></span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Total", value: detail.totalCount || detail.campaignLeads?.length || 0, color: "text-slate-300" },
                  { label: "Sent", value: detail.sentCount, color: "text-accent-400" },
                  { label: "Failed", value: detail.failedCount, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg bg-slate-950/40 ring-1 ring-slate-800 p-2 text-center">
                    <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              {/* Lead tabs */}
              {detail.campaignLeads && detail.campaignLeads.length > 0 && (
                <div className="rounded-lg bg-slate-950/40 ring-1 ring-slate-800 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                    Discovered Leads
                  </div>
                  <div className="max-h-[240px] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-950/80 ring-1 ring-slate-800">
                        <tr className="text-slate-300">
                          <th className="px-2 py-2">Business</th>
                          <th className="px-2 py-2">Phone</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Site</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {detail.campaignLeads.map((lead: any) => (
                          <tr key={lead.id}>
                            <td className="px-2 py-2">
                              <div className="text-slate-200">{lead.businessName}</div>
                              <div className="text-slate-500">{lead.city}</div>
                            </td>
                            <td className="px-2 py-2 font-mono text-slate-300">{lead.phone}</td>
                            <td className="px-2 py-2">
                              <span className={clsx("px-2 py-1 rounded-md ring-1 text-xs", {
                                "pending": "bg-slate-900/40 ring-slate-800 text-slate-400",
                                "processing": "bg-blue-500/10 ring-blue-500/20 text-blue-400",
                                "site_deployed": "bg-purple-500/10 ring-purple-500/20 text-purple-400",
                                "sms_sent": "bg-accent-500/10 ring-accent-500/20 text-accent-400",
                                "failed": "bg-red-500/10 ring-red-500/20 text-red-400",
                              }[lead.status] || "bg-slate-900/40 ring-slate-800 text-slate-400")}>
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              {lead.siteUrl ? (
                                <a href={lead.siteUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:text-accent-400 text-xs">
                                  View
                                </a>
                              ) : lead.status === "failed" && lead.errorMessage ? (
                                <span className="text-red-400 text-xs" title={lead.errorMessage}>Error</span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Legacy contacts (for old-style bulk SMS campaigns) */}
              {detail.campaignContacts && detail.campaignContacts.length > 0 && (
                <div className="rounded-lg bg-slate-950/40 ring-1 ring-slate-800 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                    Contacts (Bulk SMS)
                  </div>
                  <div className="max-h-[200px] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-950/80 ring-1 ring-slate-800">
                        <tr className="text-slate-300">
                          <th className="px-2 py-2">Contact</th>
                          <th className="px-2 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {detail.campaignContacts.map((cc: any) => (
                          <tr key={cc.id}>
                            <td className="px-2 py-2">
                              <div className="font-mono text-slate-200">{cc.contact.phone}</div>
                              <div className="text-slate-500">{cc.contact.name || "—"}</div>
                            </td>
                            <td className="px-2 py-2">
                              <span className="px-2 py-1 rounded-md ring-1 bg-slate-900/40 ring-slate-800">{cc.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <BulkComposer open={open} onClose={() => setOpen(false)} contacts={contacts} defaultFromNumber={""} />
    </div>
  );
}

