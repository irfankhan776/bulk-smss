import { useEffect, useMemo, useState, useCallback } from "react";
import clsx from "clsx";
import { api } from "../api/client";
import { useAppStore, Contact } from "../store/useAppStore";

function parseCsvHeaders(csvText: string) {
  const first = csvText.split(/\r?\n/).find((l) => l.trim());
  if (!first) return [];
  return first.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

// Simple Toast Notification Component embedded in this page
function Toast({ messages, remove }: { messages: any[], remove: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {messages.map((m) => (
        <div key={m.id} className={clsx(
          "px-4 py-3 rounded-lg shadow-lg text-sm border flex items-center justify-between min-w-[300px] pointer-events-auto",
          m.type === "error" ? "bg-red-950/95 border-red-500/50 text-red-200" : "bg-emerald-950/95 border-emerald-500/50 text-emerald-200"
        )}>
          <span>{m.message}</span>
          <button onClick={() => remove(m.id)} className="ml-4 text-slate-400 hover:text-white opacity-60">✕</button>
        </div>
      ))}
    </div>
  );
}

// Extract row component to handle its own loading/error state
function ContactRow({ contact, save }: { contact: Contact, save: (id: string, patch: Partial<Contact>) => Promise<void> }) {
  const [name, setName] = useState(contact.name || "");
  const [tags, setTags] = useState((contact.tags || []).join(", "));
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Only save if changed
  const handleBlur = async () => {
    const newTags = tags.split(",").map(t => t.trim()).filter(Boolean);
    const hasChanges = name !== (contact.name || "") || newTags.join(",") !== (contact.tags || []).join(",");
    
    if (!hasChanges) return;

    setStatus("saving");
    try {
      await save(contact.id, { name, tags: newTags });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.response?.data?.error || err?.message || "Failed to save contact.");
      // Revert state on error
      setName(contact.name || "");
      setTags((contact.tags || []).join(", "));
    }
  };

  return (
    <tr className="hover:bg-slate-900/40 relative group">
      <td className="px-4 py-3 font-mono text-slate-200 w-1/4">{contact.phone}</td>
      <td className="px-4 py-3 w-1/3">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setStatus("idle"); }}
          onBlur={handleBlur}
          placeholder="Name"
          className="w-full bg-transparent border-b border-transparent focus:border-accent-500 focus:bg-slate-950/40 px-2 py-1 transition-colors text-sm rounded-none"
        />
      </td>
      <td className="px-4 py-3 w-1/3">
        <input
          value={tags}
          onChange={(e) => { setTags(e.target.value); setStatus("idle"); }}
          onBlur={handleBlur}
          placeholder="vip, trial, …"
          className="w-full bg-transparent border-b border-transparent focus:border-accent-500 focus:bg-slate-950/40 px-2 py-1 transition-colors text-sm rounded-none"
        />
      </td>
      <td className="px-4 py-3 w-32 text-right">
        <div className="h-6 flex items-center justify-end text-xs font-medium">
          {status === "saving" && <span className="text-blue-400 animate-pulse">Saving...</span>}
          {status === "success" && <span className="text-emerald-400">✓ Saved</span>}
          {status === "error" && <span className="text-red-400" title={errorMsg}>✗ Error</span>}
        </div>
      </td>
    </tr>
  );
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

  // New Contact State
  const [showAdd, setShowAdd] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState("");
  const [adding, setAdding] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<any[]>([]);
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const loadContacts = useCallback(async () => {
    try {
      const { data } = await api.get("/contacts", { params: { page: 1, pageSize: 500 } });
      setContacts((data?.items || []) as Contact[]);
    } catch (err: any) {
      addToast("error", "Failed to load contacts: " + (err?.response?.data?.error || err.message));
    }
  }, [setContacts, addToast]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

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
    // This is called by ContactRow. We throw so the row can show error
    await api.patch(`/contacts/${id}`, patch);
    
    // Update local state without fetching all
    setContacts(contacts.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim()) {
      addToast("error", "Phone number is required");
      return;
    }
    
    setAdding(true);
    try {
      const tagsArray = newTags.split(",").map(t => t.trim()).filter(Boolean);
      await api.post("/contacts", { phone: newPhone, name: newName, tags: tagsArray });
      addToast("success", `Contact ${newPhone} added successfully`);
      setNewPhone("");
      setNewName("");
      setNewTags("");
      setShowAdd(false);
      await loadContacts();
    } catch (err: any) {
      addToast("error", "Error adding contact: " + (err?.response?.data?.error || err.message));
    } finally {
      setAdding(false);
    }
  }

  async function importCsv() {
    setImporting(true);
    setImportResult(null);
    try {
      const { data } = await api.post("/contacts/import", { csvText, mapping });
      setImportResult(data);
      addToast("success", `Imported successfully! Created: ${data.created}, Updated: ${data.updated}`);
      await loadContacts();
      
      // Clear if completely successful
      if (data.errorsCount === 0) {
        setCsvText("");
      } else {
        addToast("error", `Import finished with ${data.errorsCount} errors. Check results below.`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Import failed — check your CSV and column mapping";
      addToast("error", msg);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6 pb-20 relative">
      <Toast messages={toasts} remove={removeToast} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-accent-400 mb-1">AUDIENCE MANAGEMENT</div>
          <div className="text-2xl font-bold text-white tracking-tight">Contacts Directory</div>
          <div className="text-sm text-slate-400 mt-1">Manage your contacts, tags, and import lists</div>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg shadow-lg shadow-accent-500/20 transition-all font-medium text-sm flex items-center gap-2 self-start sm:self-auto"
        >
          {showAdd ? '− Cancel' : '+ Add Contact'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddContact} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-wrap gap-3 items-end shadow-inner animate-in fade-in slide-in-from-top-2">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">Phone *</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+15551234567"
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="John Doe"
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">Tags (comma separated)</label>
            <input
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="vip, lead"
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-2 text-sm"
            />
          </div>
          <button 
            type="submit" 
            disabled={adding}
            className="px-6 py-2 bg-slate-100 hover:bg-white text-slate-900 font-semibold rounded-md transition-colors disabled:opacity-50 text-sm h-[38px]"
          >
            {adding ? "Saving..." : "Save Contact"}
          </button>
        </form>
      )}

      <div className="rounded-xl bg-slate-900/40 ring-1 ring-slate-800 p-3 flex flex-wrap gap-3 items-center backdrop-blur-sm">
        <div className="relative flex-1 min-w-[250px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search phone or name…"
            className="w-full rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 pl-9 pr-3 py-2 text-sm transition-all shadow-inner"
          />
        </div>
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="w-48 rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-2 text-sm transition-all shadow-inner">
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-800 text-slate-300">
          {filtered.length} matching contacts
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-slate-800 overflow-hidden bg-slate-900/20 backdrop-blur-sm shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-900 border-b border-slate-800">
              <tr className="text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Name (Click to edit)</th>
                <th className="px-4 py-3">Tags (Click to edit)</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map((c) => (
                <ContactRow key={c.id} contact={c} save={saveInline} />
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center">
                    <div className="text-slate-500 mb-2">No contacts found</div>
                    <div className="text-sm text-slate-600">Try adjusting your filters or import a new list.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <div className="p-5 border-b border-slate-800 bg-slate-900/50">
          <h3 className="text-lg font-semibold text-white">Bulk Import CSV</h3>
          <p className="text-sm text-slate-400 mt-1">Paste your CSV content below and map the appropriate columns.</p>
        </div>
        
        <div className="p-5 space-y-5">
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder='Phone,Name,Tags\n"+15551234567",Imran,"vip, trial"\n"+15559876543",John,"lead"'
            className="w-full rounded-lg bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 p-4 text-sm font-mono leading-relaxed shadow-inner"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone Column *</label>
              <select
                value={mapping.phone}
                onChange={(e) => setMapping((m) => ({ ...m, phone: e.target.value }))}
                className={clsx("w-full rounded-md bg-slate-950 ring-1 px-3 py-2.5 text-sm transition-all", mapping.phone ? "ring-slate-800 focus:ring-accent-500" : "ring-red-500/50")}
              >
                <option value="">Select phone column…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name Column</label>
              <select value={mapping.name || ""} onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value || undefined }))} className="w-full rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-2.5 text-sm transition-all">
                <option value="">-- None --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tags Column</label>
              <select value={mapping.tags || ""} onChange={(e) => setMapping((m) => ({ ...m, tags: e.target.value || undefined }))} className="w-full rounded-md bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-2.5 text-sm transition-all">
                <option value="">-- None --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row gap-4 sm:items-center">
            <button
              disabled={importing || !csvText.trim() || !mapping.phone}
              onClick={importCsv}
              className="px-6 py-2.5 rounded-lg font-medium text-sm bg-accent-600 text-white hover:bg-accent-500 shadow-lg shadow-accent-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? "Importing Data…" : "Start Import"}
            </button>
            
            {importResult && (
              <div className="flex-1">
                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                    Created: <strong>{importResult.created}</strong>
                  </div>
                  <div className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20">
                    Updated: <strong>{importResult.updated}</strong>
                  </div>
                  {importResult.errorsCount > 0 && (
                    <div className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full border border-red-500/20">
                      Failed: <strong>{importResult.errorsCount}</strong>
                    </div>
                  )}
                </div>
                
                {importResult.errors?.length > 0 && (
                  <div className="mt-3 rounded-md bg-red-950/30 border border-red-900/50 p-3 max-h-40 overflow-y-auto">
                    <div className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wider">Import Errors</div>
                    {importResult.errors.map((err: any, idx: number) => (
                      <div key={idx} className="text-xs text-red-300 font-mono py-0.5">
                        <span className="opacity-50">Line {idx + 1}:</span> {err.phone} - {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


