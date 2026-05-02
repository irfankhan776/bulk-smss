import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api } from "../api/client";
import { useAppStore, Contact } from "../store/useAppStore";

function parseCsvHeaders(csvText: string) {
  const first = csvText.split(/\r?\n/).find((l) => l.trim());
  if (!first) return [];
  return first.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

export default function Contacts() {
  const contacts = useAppStore((s) => s.contacts);
  const setContacts = useAppStore((s) => s.setContacts);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");

  const [csvText, setCsvText] = useState("");
  const headers = useMemo(() => parseCsvHeaders(csvText), [csvText]);
  const [mapping, setMapping] = useState<{ phone: string; name?: string; tags?: string }>({ phone: "" });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await api.get("/contacts", { params: { page: 1, pageSize: 200 } });
      setContacts((data?.items || []) as Contact[]);
    })();
  }, [setContacts]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return contacts.filter((c) => {
      const okQ = !qq || c.phone.toLowerCase().includes(qq) || (c.name || "").toLowerCase().includes(qq);
      const okTag = !tag || (c.tags || []).includes(tag);
      return okQ && okTag;
    });
  }, [contacts, q, tag]);

  async function saveInline(id: string, patch: Partial<Contact>) {
    const prev = contacts;
    setContacts(prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await api.patch(`/contacts/${id}`, patch);
    } catch {
      setContacts(prev);
    }
  }

  async function importCsv() {
    setImporting(true);
    setImportResult(null);
    try {
      const { data } = await api.post("/contacts/import", { csvText, mapping });
      setImportResult(data);
      const refreshed = await api.get("/contacts", { params: { page: 1, pageSize: 200 } });
      setContacts(refreshed.data?.items || []);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Search + tags + inline edit</div>
          <div className="text-xl font-semibold">Contacts</div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-3 flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search phone or name…"
          className="w-72 rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm"
        />
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm">
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-slate-400">{filtered.length} shown</div>
      </div>

      <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/80 ring-1 ring-slate-800">
            <tr className="text-slate-300">
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Name (edit)</th>
              <th className="px-4 py-3">Tags (comma separated)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-3 font-mono text-slate-200">{c.phone}</td>
                <td className="px-4 py-3">
                  <input
                    value={c.name || ""}
                    onChange={(e) => saveInline(c.id, { name: e.target.value })}
                    placeholder="Name"
                    className="w-full rounded-md bg-slate-950/40 ring-1 ring-slate-800 px-3 py-2 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={(c.tags || []).join(", ")}
                    onChange={(e) => saveInline(c.id, { tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) as any })}
                    placeholder="vip, trial, …"
                    className="w-full rounded-md bg-slate-950/40 ring-1 ring-slate-800 px-3 py-2 text-sm"
                  />
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                  No contacts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4 space-y-3">
        <div>
          <div className="text-xs text-slate-400">CSV import</div>
          <div className="font-semibold">Paste CSV + map columns</div>
        </div>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={6}
          placeholder='Phone,Name,Tags\n"+15551234567",Imran,"vip;trial"'
          className="w-full rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm font-mono"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-400 mb-1">Phone column</div>
            <select
              value={mapping.phone}
              onChange={(e) => setMapping((m) => ({ ...m, phone: e.target.value }))}
              className={clsx("w-full rounded-md bg-slate-950/50 ring-1 px-3 py-2 text-sm", mapping.phone ? "ring-slate-800" : "ring-red-500/40")}
            >
              <option value="">Select…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Name column</div>
            <select value={mapping.name || ""} onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value || undefined }))} className="w-full rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm">
              <option value="">None</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Tags column</div>
            <select value={mapping.tags || ""} onChange={(e) => setMapping((m) => ({ ...m, tags: e.target.value || undefined }))} className="w-full rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm">
              <option value="">None</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={importing || !csvText.trim() || !mapping.phone}
            onClick={importCsv}
            className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import"}
          </button>
          {importResult && (
            <div className="text-sm text-slate-300">
              Created <span className="text-accent-400">{importResult.created}</span>, Updated <span className="text-accent-400">{importResult.updated}</span>, Errors{" "}
              <span className={clsx(importResult.errorsCount ? "text-red-300" : "text-slate-400")}>{importResult.errorsCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

