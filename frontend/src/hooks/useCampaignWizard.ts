import { useState, useCallback } from "react";
import { api } from "../api/client";

export interface WizardStep1 {
  name: string;
  niche: string;
  template: string;
  maxLeads: number;
}

export interface WizardStep2Csv {
  mode: "csv_upload";
  csvRaw: string;
  csvResult?: {
    valid: boolean;
    errors: string[];
    rowCount: number;
    preview: { businessName: string; city: string; phone: string }[];
  };
}

export interface WizardStep2Maps {
  mode: "google_maps";
  googleCity: string;
  googleApiKey: string;
}

export type WizardStep2 = WizardStep2Csv | WizardStep2Maps;

export interface WizardStep3 {
  outreachBody: string;
  delaySeconds: number;
}

export interface LeadProgress {
  leadId: string | null;
  status: string;
  businessName?: string;
  city?: string;
  siteUrl?: string;
  phone?: string;
  error?: string;
  found?: number;
  count?: number;
  at: number;
}

export function useCampaignWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [step1, setStep1] = useState<WizardStep1>({
    name: "",
    niche: "barber",
    template: "barber",
    maxLeads: 50,
  });
  const [step2, setStep2] = useState<WizardStep2>({
    mode: "csv_upload",
    csvRaw: "",
  });
  const [step3, setStep3] = useState<WizardStep3>({
    outreachBody: "Hi {BUSINESS_NAME}, check out your new site: {SITE_URL}\nBook your appointment today!",
    delaySeconds: 7,
  });
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchResult, setLaunchResult] = useState<{ campaignId: string; leadsQueued: number } | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setStep1({ name: "", niche: "barber", template: "barber", maxLeads: 50 });
    setStep2({ mode: "csv_upload", csvRaw: "" });
    setStep3({ outreachBody: "Hi {BUSINESS_NAME}, check out your new site: {SITE_URL}\nBook your appointment today!", delaySeconds: 7 });
    setLaunching(false);
    setLaunchError(null);
    setLaunchResult(null);
    setCampaignId(null);
  }, []);

  async function validateCSV(csvRaw: string) {
    const { data } = await api.post("/campaigns/validate-csv", { csvRaw });
    return data;
  }

  async function launch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const body: Record<string, unknown> = {
        name: step1.name,
        niche: step1.niche,
        template: step1.template,
        source: step2.mode,
        outreachBody: step3.outreachBody,
        delaySeconds: step3.delaySeconds,
        maxLeads: step1.maxLeads,
      };

      if (step2.mode === "csv_upload") {
        body.csvRaw = (step2 as WizardStep2Csv).csvRaw;
      } else {
        body.googleCity = (step2 as WizardStep2Maps).googleCity;
        body.googleApiKey = (step2 as WizardStep2Maps).googleApiKey;
      }

      const { data } = await api.post("/campaigns/wizard", body);
      setLaunchResult(data);
      setCampaignId(data.campaignId);
      setStep(4);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.errors?.join(", ") || e?.message || "Launch failed";
      setLaunchError(msg);
    } finally {
      setLaunching(false);
    }
  }

  return {
    step,
    setStep,
    step1,
    setStep1,
    step2,
    setStep2,
    step3,
    setStep3,
    launching,
    launchError,
    launchResult,
    campaignId,
    reset,
    validateCSV,
    launch,
  };
}
