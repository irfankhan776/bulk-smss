import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api } from "../api/client";
import { Contact } from "../store/useAppStore";
import ContactTable from "./ContactTable";

export default function BulkComposer({
  open,
  onClose,
  contacts,
  defaultFromNumber
}: {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  defaultFromNumber: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [body, setBody] = useState("Hi {name}, ");
  const [fromNumber, setFromNumber] = useState(defaultFromNumber);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName("");
    setBody("Hi {name}, ");
    setSelected({});
    setBusy(false);
    setError(null);
    setScheduleMode("now");
    setScheduleAt("");
    setFromNumber(defaultFromNumber);
  }, [open, defaultFromNumber]);

  if (!open) return null;

  const toggle = (id: string, next: boolean) => setSelected((s) => ({ ...s, [id]: next }));
  const toggleAll = (next: boolean, ids: string[]) =>
    setSelected((s) => {
      const out = { ...s };
      ids.forEach((id) => {
        out[id] = next;
      });
      return out;
    });

  const canNext =
    (step === 1 && name.trim() && body.trim()) ||
    (step === 2 && selectedIds.length > 0) ||
    (step === 3 && fromNumber.trim() && (scheduleMode === "now" || !!scheduleAt));

  async function createAndStart() {
    setBusy(true);
    setError(null);
    try {
      const create = await api.post("/campaigns", { name, body, contactIds: selectedIds });
      const campaignId = create.data?.campaignId;
      if (!campaignId) throw new Error("Campaign creation failed");

      await api.post(`/campaigns/${campaignId}/start`, {
        fromNumber,
        scheduleAt: scheduleMode === "later" ? new Date(scheduleAt).toISOString() : null
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-slate-950 ring-1 ring-slate-800 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">New Campaign</div>
            <div className="text-lg font-semibold">Bulk Composer</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md bg-slate-900/60 ring-1 ring-slate-800 hover:bg-slate-900">
            Close
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className={clsx("px-2 py-1 rounded-md ring-1", step === n ? "bg-accent-500/10 ring-accent-500/30 text-accent-400" : "bg-slate-900/40 ring-slate-800")}>
                Step {n}
              </div>
            ))}
            <div className="ml-auto text-xs text-slate-500">Token: <span className="font-mono text-accent-400">{`{name}`}</span></div>
          </div>

          {step === 1 && (
            <div className="grid gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm font-mono" />
              <div className="text-xs text-slate-400">Preview (example): {body.replaceAll("{name}", "Imran")}</div>
            </div>
          )}

          {step === 2 && <ContactTable contacts={contacts} selectedIds={selected} onToggle={toggle} onToggleAll={toggleAll} />}

          {step === 3 && (
            <div className="grid gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Sender number</div>
                  <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+1..." className="w-full rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Schedule</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScheduleMode("now")}
                      className={clsx("px-3 py-2 rounded-md text-sm ring-1", scheduleMode === "now" ? "bg-accent-500/10 ring-accent-500/30 text-accent-400" : "bg-slate-900/40 ring-slate-800")}
                    >
                      Now
                    </button>
                    <button
                      onClick={() => setScheduleMode("later")}
                      className={clsx("px-3 py-2 rounded-md text-sm ring-1", scheduleMode === "later" ? "bg-accent-500/10 ring-accent-500/30 text-accent-400" : "bg-slate-900/40 ring-slate-800")}
                    >
                      Later
                    </button>
                    {scheduleMode === "later" && (
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="ml-auto rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
                <div className="text-sm">
                  Sending to <span className="text-accent-400 font-semibold">{selectedIds.length}</span> contacts
                </div>
                <div className="mt-2 text-xs text-slate-400">You’ll see live progress in Campaigns via socket events.</div>
              </div>
            </div>
          )}

          {error && <div className="mt-4 rounded-md bg-red-500/10 ring-1 ring-red-500/20 px-3 py-2 text-sm text-red-200">{error}</div>}

          <div className="mt-5 flex items-center justify-between">
            <button
              disabled={busy || step === 1}
              onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as any)))}
              className="px-4 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-800 disabled:opacity-50"
            >
              Back
            </button>
            <div className="flex items-center gap-2">
              {step < 3 ? (
                <button
                  disabled={busy || !canNext}
                  onClick={() => setStep((s) => (s === 3 ? 3 : ((s + 1) as any)))}
                  className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  disabled={busy || !canNext}
                  onClick={createAndStart}
                  className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20 disabled:opacity-50"
                >
                  {busy ? "Starting…" : "Confirm & Start"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

