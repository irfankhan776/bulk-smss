import { useEffect, useRef } from "react";
import { format } from "date-fns";
import clsx from "clsx";
import { Message } from "../store/useAppStore";

function StatusBadge({ status }: { status: Message["status"] }) {
  if (status === "queued")
    return <span className="text-slate-500 animate-pulse" title="Queued">⟳</span>;
  if (status === "sent")
    return <span className="text-blue-400" title="Sent">✓</span>;
  if (status === "delivered")
    return <span className="text-emerald-400 font-bold" title="Delivered">✓✓</span>;
  if (status === "failed")
    return (
      <span
        className="text-red-400 font-bold cursor-help"
        title="Delivery failed — check Telnyx dashboard for details"
      >
        ✕
      </span>
    );
  return null;
}

export default function ConversationThread({
  messages,
  loading,
}: {
  messages: Message[];
  loading?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl bg-slate-900/20 ring-1 ring-slate-800 min-h-[300px]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <span className="text-3xl animate-spin inline-block">⟳</span>
          <span className="text-sm">Loading messages…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-auto rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4 h-full min-h-[300px]">
      {!messages.length ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-12">
          <div className="text-4xl opacity-30">💬</div>
          <div className="text-sm text-slate-500 font-medium">No messages yet</div>
          <div className="text-xs text-slate-600">Type a message below and press Enter to send</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1">
          {messages.map((m) => {
            const inbound = m.direction === "INBOUND";
            const isFailed = m.status === "failed";
            return (
              <div
                key={m.id}
                className={clsx(
                  "flex",
                  inbound ? "justify-start" : "justify-end"
                )}
              >
                <div
                  className={clsx(
                    "max-w-[78%] rounded-2xl px-4 py-2.5 ring-1 transition-all",
                    inbound
                      ? "bg-accent-500/10 text-accent-200 ring-accent-500/20 rounded-tl-sm"
                      : isFailed
                      ? "bg-red-950/50 text-red-200 ring-red-500/30 rounded-tr-sm"
                      : "bg-slate-800/80 text-slate-100 ring-slate-700 rounded-tr-sm"
                  )}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</div>
                  <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
                    <span>{format(new Date(m.createdAt), "MMM d, h:mm a")}</span>
                    {!inbound && <StatusBadge status={m.status} />}
                  </div>
                  {isFailed && m.errorMessage && (
                    <div className="mt-1.5 pt-1.5 border-t border-red-500/20 text-xs text-red-400 font-medium">
                      Failed: {m.errorMessage}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
