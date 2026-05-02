import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";

export default function Numbers() {
  const balance = useAppStore((s) => s.balance);
  const setBalance = useAppStore((s) => s.setBalance);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function refreshAll() {
    setLoading(true);
    try {
      const [nums, bal] = await Promise.all([api.get("/numbers"), api.get("/balance")]);
      setNumbers(nums.data?.items || []);
      setBalance(bal.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    const t = setInterval(() => {
      void (async () => {
        try {
          const bal = await api.get("/balance");
          setBalance(bal.data);
        } catch {}
      })();
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Telnyx inventory</div>
          <div className="text-xl font-semibold">Numbers</div>
        </div>
        <button onClick={() => void refreshAll()} className="px-3 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-800 hover:bg-slate-900">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="rounded-xl bg-accent-500/10 ring-1 ring-accent-500/25 p-4">
        <div className="text-xs text-slate-300">Credit balance (auto refresh every 60s)</div>
        <div className="mt-1 text-3xl font-semibold text-accent-400">
          {balance ? `${balance.balance ?? "—"} ${balance.currency ?? ""}`.trim() : "—"}
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Purchase/manage numbers in the Telnyx portal: <a className="underline text-slate-200" href="https://portal.telnyx.com" target="_blank" rel="noreferrer">portal.telnyx.com</a>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/80 ring-1 ring-slate-800">
            <tr className="text-slate-300">
              <th className="px-4 py-3">Phone Number</th>
              <th className="px-4 py-3">Friendly</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {numbers.map((n) => (
              <tr key={n.phoneNumber} className="hover:bg-slate-900/40">
                <td className="px-4 py-3 font-mono text-slate-200">{n.phoneNumber}</td>
                <td className="px-4 py-3 text-slate-300">{n.friendlyName || "—"}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 rounded-md ring-1 bg-slate-900/40 ring-slate-800 text-xs">{n.status || "—"}</span>
                </td>
              </tr>
            ))}
            {!numbers.length && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                  No numbers loaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

