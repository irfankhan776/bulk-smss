import { NavLink, Route, Routes } from "react-router-dom";
import React from "react";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Campaigns from "./pages/Campaigns";
import Contacts from "./pages/Contacts";
import Numbers from "./pages/Numbers";
import { useSocket } from "./hooks/useSocket";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/20 text-red-200 border border-red-500 rounded-lg">
          <h2 className="text-xl font-bold mb-2">Something went wrong.</h2>
          <pre className="whitespace-pre-wrap text-sm">{this.state.error?.toString()}</pre>
          <pre className="whitespace-pre-wrap text-sm mt-2 text-red-400">{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/inbox", label: "Inbox" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/contacts", label: "Contacts" },
  { to: "/numbers", label: "Numbers" }
];

export default function App() {
  useSocket();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-accent-500/15 ring-1 ring-accent-500/30 grid place-items-center">
              <span className="font-mono text-accent-400 text-sm">SMS</span>
            </div>
            <div>
              <div className="text-sm text-slate-300">BULK AUTOMATION</div>
              <div className="font-semibold tracking-wide">SMS Platform</div>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  [
                    "px-3 py-1.5 rounded-md text-sm ring-1 transition",
                    isActive ? "bg-accent-500/10 ring-accent-500/40 text-accent-400" : "bg-slate-900/30 ring-slate-800 text-slate-200 hover:bg-slate-900/60"
                  ].join(" ")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-6">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/numbers" element={<Numbers />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

