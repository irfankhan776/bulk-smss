import { format } from "date-fns";
import clsx from "clsx";
import { Message } from "../store/useAppStore";

function statusGlyph(s: Message["status"]) {
  if (s === "queued") return "…";
  if (s === "sent") return "✓";
  if (s === "delivered") return "✓✓";
  if (s === "failed") return "!";
  return "";
}

export default function ConversationThread({ messages }: { messages: Message[] }) {
  return (
    <div className="flex-1 overflow-auto rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
      <div className="space-y-3">
        {messages.map((m) => {
          const inbound = m.direction === "INBOUND";
          return (
            <div key={m.id} className={clsx("flex", inbound ? "justify-start" : "justify-end")}>
              <div
                className={clsx(
                  "max-w-[75%] rounded-2xl px-3 py-2 ring-1",
                  inbound
                    ? "bg-accent-500/10 text-accent-400 ring-accent-500/25"
                    : "bg-slate-800/70 text-slate-100 ring-slate-700"
                )}
              >
                <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{m.body}</div>
                <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-slate-400">
                  <span>{format(new Date(m.createdAt), "PPp")}</span>
                  {!inbound && <span className={clsx(m.status === "failed" ? "text-red-400" : "text-slate-400")}>{statusGlyph(m.status)}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {!messages.length && <div className="text-sm text-slate-400">No messages yet.</div>}
      </div>
    </div>
  );
}

