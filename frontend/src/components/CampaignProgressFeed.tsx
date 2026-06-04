import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { LeadProgress } from "../hooks/useCampaignWizard";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

interface CampaignProgressFeedProps {
  campaignId: string;
  outreachBody: string;
  onComplete?: () => void;
}

function statusIcon(status: string) {
  switch (status) {
    case "discovery_started": return "🗺️";
    case "discovery_complete": return "✅";
    case "leads_enqueued": return "🚀";
    case "processing": return "⚙️";
    case "site_deployed": return "🌐";
    case "sms_sent": return "📱";
    case "failed": return "❌";
    default: return "⏳";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "discovery_started": return "Searching Google Maps...";
    case "discovery_complete": return "Discovery complete!";
    case "leads_enqueued": return "Leads enqueued for processing";
    case "processing": return "Generating site...";
    case "site_deployed": return "Site deployed!";
    case "sms_sent": return "SMS sent!";
    case "failed": return "Failed";
    default: return status;
  }
}

export default function CampaignProgressFeed({ campaignId, outreachBody, onComplete }: CampaignProgressFeedProps) {
  const [events, setEvents] = React.useState<LeadProgress[]>([]);
  const [connected, setConnected] = React.useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.emit("join:campaign", campaignId);

    socket.on("lead:progress", (data: LeadProgress) => {
      setEvents((prev) => [...prev, { ...data, at: Date.now() }]);
    });

    socket.on("campaign:progress", (data: { status: string; total: number }) => {
      if (data.status === "completed" && onComplete) {
        onComplete();
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [campaignId, onComplete]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const totalSent = events.filter((e) => e.status === "sms_sent").length;
  const totalFailed = events.filter((e) => e.status === "failed").length;
  const totalProcessed = totalSent + totalFailed;

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-accent-400 animate-pulse" : "bg-slate-600"}`} />
        {connected ? "Live" : "Connecting..."}
        {totalProcessed > 0 && (
          <>
            <span className="ml-2 text-accent-400">{totalSent} sent</span>
            {totalFailed > 0 && <span className="text-red-400">{totalFailed} failed</span>}
          </>
        )}
      </div>

      {/* Message preview */}
      <div className="rounded-lg bg-slate-900/40 ring-1 ring-slate-800 p-3">
        <div className="text-xs text-slate-500 mb-1">Your outreach message:</div>
        <div className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{outreachBody}</div>
      </div>

      {/* Event feed */}
      <div className="rounded-lg bg-slate-950/60 ring-1 ring-slate-800 p-3 space-y-1.5 max-h-80 overflow-y-auto">
        {events.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-4">
            Waiting for activity...
          </div>
        )}
        {events.map((event, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-base leading-none mt-0.5 flex-shrink-0">{statusIcon(event.status)}</span>
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${event.status === "failed" ? "text-red-400" : event.status === "sms_sent" ? "text-accent-400" : "text-slate-300"}`}>
                {statusLabel(event.status)}
              </div>
              {event.businessName && (
                <div className="text-slate-400 font-mono truncate">{event.businessName}{event.city ? `, ${event.city}` : ""}</div>
              )}
              {event.siteUrl && (
                <a href={event.siteUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500/70 hover:text-accent-400 truncate block">
                  {event.siteUrl}
                </a>
              )}
              {event.phone && (
                <div className="text-slate-500 font-mono">{event.phone}</div>
              )}
              {event.error && (
                <div className="text-red-400 font-mono">{event.error}</div>
              )}
              {event.found !== undefined && (
                <div className="text-slate-400">Found {event.found} business(es) without a website</div>
              )}
              {event.count !== undefined && (
                <div className="text-accent-400">{event.count} lead(s) queued for processing</div>
              )}
              <div className="text-slate-600 text-[10px] mt-0.5">
                {new Date(event.at).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
