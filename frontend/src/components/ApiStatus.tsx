import { useEffect } from "react";
import { api } from "../api/client";
import { useAppStore, ApiStatusItem } from "../store/useAppStore";

const SERVICES = [
  { key: "telnyx", label: "Telnyx SMS" },
  { key: "cloudflare", label: "Cloudflare Pages" },
  { key: "redis", label: "Redis" },
];

export default function ApiStatus() {
  const apiStatus = useAppStore((s) => s.apiStatus);
  const setApiStatus = useAppStore((s) => s.setApiStatus);
  const setBalance = useAppStore((s) => s.setBalance);

  async function checkAll() {
    for (const svc of SERVICES) {
      setApiStatus(svc.key, { status: "checking" });
    }

    // Telnyx — balance check
    try {
      const { data } = await api.get("/balance");
      setApiStatus("telnyx", {
        status: "ok",
        message: `${data.balance ?? "?"} ${data.currency ?? ""}`.trim(),
        balance: data.balance,
      });
      setBalance({ balance: data.balance, currency: data.currency });
    } catch {
      setApiStatus("telnyx", { status: "error", message: "Cannot reach backend" });
    }

    // Cloudflare — pages projects check
    try {
      const { data } = await api.get("/cloudflare/status");
      setApiStatus("cloudflare", {
        status: data.ok ? "ok" : "error",
        message: data.message || (data.ok ? "Connected" : "Not connected"),
      });
    } catch {
      setApiStatus("cloudflare", { status: "error", message: "Cannot reach backend" });
    }

    // Redis — health check
    try {
      const { data } = await api.get("/health");
      const redisOk = data.redis === true || data.redis === "true" || data.ok === true;
      setApiStatus("redis", {
        status: redisOk ? "ok" : "error",
        message: redisOk ? "Connected" : "Not connected",
      });
    } catch {
      setApiStatus("redis", { status: "error", message: "Cannot reach backend" });
    }
  }

  useEffect(() => {
    void checkAll();
  }, []);

  function statusDot(item: ApiStatusItem) {
    if (item.status === "checking") {
      return <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />;
    }
    if (item.status === "ok") {
      return <span className="w-2 h-2 rounded-full bg-emerald-400" />;
    }
    if (item.status === "error") {
      return <span className="w-2 h-2 rounded-full bg-red-400" />;
    }
    return <span className="w-2 h-2 rounded-full bg-slate-600" />;
  }

  return (
    <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-400">System health</div>
          <div className="font-semibold text-sm">API Status</div>
        </div>
        <button
          onClick={() => void checkAll()}
          className="px-3 py-1.5 rounded-md text-xs bg-slate-900/50 ring-1 ring-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
        >
          Refresh
        </button>
      </div>
      <div className="space-y-2">
        {SERVICES.map((svc) => {
          const item = apiStatus[svc.key] || { status: "idle" };
          return (
            <div key={svc.key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {statusDot(item)}
                <span className={item.status === "error" ? "text-red-300" : item.status === "ok" ? "text-slate-200" : "text-slate-400"}>
                  {svc.label}
                </span>
              </div>
              <div className="text-xs text-slate-500 font-mono text-right">
                {item.message || (item.status === "checking" ? "Checking..." : "—")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
