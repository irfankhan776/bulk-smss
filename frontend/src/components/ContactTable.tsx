import { useMemo, useState } from "react";
import clsx from "clsx";
import { Contact } from "../store/useAppStore";

export default function ContactTable({
  contacts,
  selectedIds,
  onToggle,
  onToggleAll
}: {
  contacts: Contact[];
  selectedIds: Record<string, boolean>;
  onToggle: (id: string, next: boolean) => void;
  onToggleAll: (next: boolean, ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");

  const tags = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => c.tags?.forEach((t) => s.add(t)));
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

  const allIds = filtered.map((c) => c.id);
  const selectedCount = allIds.filter((id) => selectedIds[id]).length;
  const allSelected = allIds.length > 0 && selectedCount === allIds.length;

  return (
    <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
      <div className="p-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search phone or name…"
          className="w-72 rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm"
        />
        <select value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm">
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div className="ml-auto text-xs text-slate-400">
          Selected <span className="text-accent-400">{selectedCount}</span> / {allIds.length}
        </div>
      </div>

      <div className="max-h-[360px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-950/80 backdrop-blur ring-1 ring-slate-800">
            <tr className="text-slate-300">
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked, allIds)} />
              </th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((c) => (
              <tr key={c.id} className={clsx("hover:bg-slate-900/40", selectedIds[c.id] && "bg-accent-500/5")}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={!!selectedIds[c.id]} onChange={(e) => onToggle(c.id, e.target.checked)} />
                </td>
                <td className="px-3 py-2 font-mono text-slate-200">{c.phone}</td>
                <td className="px-3 py-2">{c.name || <span className="text-slate-500">—</span>}</td>
                <td className="px-3 py-2 text-slate-300">{(c.tags || []).join(", ") || <span className="text-slate-500">—</span>}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                  No contacts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

