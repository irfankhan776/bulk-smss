import React, { useState } from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import { useCampaignWizard } from "../hooks/useCampaignWizard";
import CsvUploader from "../components/CsvUploader";
import CampaignProgressFeed from "../components/CampaignProgressFeed";

const STEPS = [
  { n: 1, label: "Campaign Setup" },
  { n: 2, label: "Upload CSV" },
  { n: 3, label: "Message Composer" },
  { n: 4, label: "Launch" },
];

const NICHE_OPTIONS = [{ value: "barber", label: "Barber" }];
const TEMPLATE_OPTIONS = [{ value: "barber", label: "Barber Template" }];

export default function CampaignWizard() {
  const navigate = useNavigate();
  const {
    step, setStep,
    step1, setStep1,
    step2, setStep2,
    step3, setStep3,
    launching, launchError, campaignId,
    reset,
    validateCSV,
    launch,
  } = useCampaignWizard();

  const [csvRaw, setCsvRaw] = useState(step2.mode === "csv_upload" ? (step2 as any).csvRaw || "" : "");

  const csvResult = (step2.mode === "csv_upload" ? (step2 as any).csvResult : null) as {
    valid: boolean;
    errors: string[];
    rowCount: number;
    preview: Record<string, string>[];
  } | null;

  function handleCsvChange(raw: string) {
    setCsvRaw(raw);
    setStep2({ mode: "csv_upload", csvRaw: raw });
  }

  async function handleCsvValidate(raw: string) {
    const result = await validateCSV(raw);
    // Store the result in step2 for the summary
    setStep2({
      mode: "csv_upload",
      csvRaw: raw,
      csvResult: result as any,
    });
    return result;
  }

  function canAdvance(): boolean {
    if (step === 1) {
      return !!(step1.name.trim() && step1.maxLeads > 0);
    }
    if (step === 2) {
      return csvResult?.valid === true;
    }
    if (step === 3) {
      return !!(
        step3.outreachBody.trim().includes("{SITE_URL}") &&
        step3.delaySeconds > 0
      );
    }
    return true;
  }

  function handleNext() {
    if (step < 4) setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
  }

  function handleBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
  }

  async function handleLaunch() {
    await launch();
  }

  const messagePreview = step3.outreachBody
    .replace(/\{BUSINESS_NAME\}/g, "Squire's Grooming Lounge")
    .replace(/\{SITE_URL\}/g, "https://sms-bulk-pages.pages.dev/squires-grooming-lounge-austin");

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/campaigns")}
          className="text-xs text-slate-500 hover:text-slate-300 mb-2 flex items-center gap-1 transition-colors"
        >
          ← Back to Campaigns
        </button>
        <h1 className="text-2xl font-bold text-slate-100">New Campaign</h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload a CSV of leads → generate a personalized landing page for each → send an SMS with the link.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={clsx(
                "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0",
                step === s.n
                  ? "bg-accent-500 text-slate-950"
                  : step > s.n
                  ? "bg-accent-500/20 text-accent-400 ring-1 ring-accent-500/40"
                  : "bg-slate-900 text-slate-500 ring-1 ring-slate-800"
              )}
            >
              {step > s.n ? "✓" : s.n}
            </div>
            <div className={clsx("text-xs hidden sm:block", step === s.n ? "text-slate-200 font-medium" : "text-slate-500")}>
              {s.label}
            </div>
            {s.n < 4 && <div className="w-6 h-px bg-slate-800 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-slate-950 ring-1 ring-slate-800 rounded-2xl p-6">

        {/* ── STEP 1: Campaign Setup ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Campaign Name
              </label>
              <input
                value={step1.name}
                onChange={(e) => setStep1((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Austin Barbers Round 2"
                className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Niche
                </label>
                <select
                  value={step1.niche}
                  onChange={(e) => setStep1((s) => ({ ...s, niche: e.target.value }))}
                  className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                >
                  {NICHE_OPTIONS.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Template
                </label>
                <select
                  value={step1.template}
                  onChange={(e) => setStep1((s) => ({ ...s, template: e.target.value }))}
                  className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                >
                  {TEMPLATE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Max Leads to Process
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={step1.maxLeads}
                onChange={(e) => setStep1((s) => ({ ...s, maxLeads: parseInt(e.target.value) || 50 }))}
                className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
              />
              <div className="text-xs text-slate-500 mt-1">
                The campaign will stop after this many SMS messages are sent.
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Upload CSV ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-900/30 ring-1 ring-slate-800 px-4 py-3 text-xs text-slate-400">
              CSV must contain columns: <span className="font-mono text-accent-400">business_name</span>,{" "}
              <span className="font-mono text-accent-400">phone</span>, and{" "}
              <span className="font-mono text-accent-400">city</span>. Headers are case-insensitive.
            </div>
            <CsvUploader
              csvRaw={csvRaw}
              onChange={handleCsvChange}
              onValidate={handleCsvValidate}
            />
          </div>
        )}

        {/* ── STEP 3: Message Composer ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Outreach Message
              </label>
              <textarea
                value={step3.outreachBody}
                onChange={(e) => setStep3((s) => ({ ...s, outreachBody: e.target.value }))}
                rows={5}
                className="w-full rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2.5 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-500/50 resize-none"
                placeholder="Hi {BUSINESS_NAME}, check out your site: {SITE_URL}"
              />
              <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>
                  <span className="font-mono text-accent-400">{"{BUSINESS_NAME}"}</span> — business name
                </span>
                <span>
                  <span className="font-mono text-accent-400">{"{SITE_URL}"}</span> — generated landing page
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Delay between SMS (seconds)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={step3.delaySeconds}
                onChange={(e) => setStep3((s) => ({ ...s, delaySeconds: parseInt(e.target.value) || 7 }))}
                className="w-32 rounded-md bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
              />
              <div className="text-xs text-slate-500 mt-1">
                Recommended: 5–10 seconds to avoid SMS rate limits.
              </div>
            </div>

            {/* Message preview */}
            <div className="rounded-xl bg-slate-900/30 ring-1 ring-slate-800 p-4">
              <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">
                Message Preview
              </div>
              <div className="text-sm text-slate-200 font-mono whitespace-pre-wrap">
                {messagePreview || <span className="text-slate-600 italic">Write a message above to see the preview…</span>}
              </div>
            </div>

            {/* Landing page mock preview */}
            <div className="rounded-xl bg-slate-900/30 ring-1 ring-slate-800 overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-800 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                Landing Page Preview
              </div>
              <div className="p-4">
                <div className="bg-slate-900 rounded-lg p-3 text-xs font-mono space-y-1">
                  <div className="text-accent-400 font-bold text-sm">Squire's Grooming Lounge</div>
                  <div className="text-slate-400">PREMIUM BARBERSHOP · AUSTIN, TX</div>
                  <div className="mt-2 text-slate-300">Expert cuts, clean fades, and old-school service.</div>
                  <div className="mt-2 text-accent-400/70">📞 +14374647338</div>
                  <div className="mt-1 text-slate-500 italic">The landing page template will fill in the business name, city, and phone from your CSV.</div>
                </div>
              </div>
            </div>

            {/* Placeholder check */}
            {!step3.outreachBody.includes("{SITE_URL}") && (
              <div className="rounded-md bg-amber-500/10 ring-1 ring-amber-500/20 px-3 py-2 text-xs text-amber-300">
                Your message must contain <span className="font-mono">{"{SITE_URL}"}</span> — the recipient will not see the site link without it.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Launch ── */}
        {step === 4 && campaignId ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Campaign Launched!</h2>
              <p className="text-sm text-slate-400">
                Campaign <span className="font-mono text-accent-400">{campaignId.slice(0, 8)}...</span> is running. Watch live below.
              </p>
            </div>

            <CampaignProgressFeed
              campaignId={campaignId}
              outreachBody={step3.outreachBody}
            />

            <div className="flex gap-3">
              <button
                onClick={() => { reset(); navigate("/campaigns"); }}
                className="px-4 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
              >
                View Campaigns
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 rounded-md text-sm bg-accent-500/10 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20 transition-colors"
              >
                Start New Campaign
              </button>
            </div>
          </div>
        ) : step === 4 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-3">Review & Launch</h2>

              {/* Summary cards */}
              <div className="space-y-3 mb-5">
                <SummaryRow label="Campaign Name" value={step1.name} />
                <SummaryRow label="Niche" value={step1.niche} />
                <SummaryRow label="Template" value={step1.template} />
                <SummaryRow label="Max Leads" value={String(step1.maxLeads)} />
                <SummaryRow
                  label="Source"
                  value={`CSV Upload (${csvResult?.rowCount ?? 0} leads)`}
                />
                <SummaryRow label="Delay" value={`${step3.delaySeconds}s between each SMS`} />
              </div>

              {/* Outreach preview */}
              <div className="rounded-xl bg-slate-900/30 ring-1 ring-slate-800 p-4 mb-5">
                <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Outreach Message</div>
                <div className="text-sm text-slate-200 font-mono whitespace-pre-wrap">
                  {messagePreview}
                </div>
              </div>

              {launchError && (
                <div className="rounded-md bg-red-500/10 ring-1 ring-red-500/20 px-3 py-2 text-sm text-red-300 mb-4">
                  {launchError}
                </div>
              )}

              <button
                onClick={handleLaunch}
                disabled={launching}
                className="w-full py-3 rounded-xl text-base font-bold bg-accent-500 text-slate-950 hover:bg-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {launching ? "Launching Campaign..." : "Launch Campaign"}
              </button>
              <div className="text-center text-xs text-slate-500 mt-2">
                Each lead: generate site → deploy to Cloudflare → {step3.delaySeconds}s delay → send SMS
              </div>
            </div>
          </div>
        ) : null}

        {/* Navigation buttons */}
        {step < 4 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={step === 1 ? () => navigate("/campaigns") : handleBack}
              className="px-4 py-2 rounded-md text-sm bg-slate-900/50 ring-1 ring-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
            >
              {step === 1 ? "Cancel" : "← Back"}
            </button>
            <button
              onClick={handleNext}
              disabled={!canAdvance()}
              className="px-6 py-2 rounded-md text-sm font-medium bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {step === 3 ? "Review →" : "Next →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-medium">{value || "—"}</span>
    </div>
  );
}
