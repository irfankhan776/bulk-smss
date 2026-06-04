import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAppStore, Campaign } from "../store/useAppStore";

export function useCampaigns() {
  const campaigns = useAppStore((s) => s.campaigns);
  const setCampaigns = useAppStore((s) => s.setCampaigns);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/campaigns");
      setCampaigns((data?.items || []) as Campaign[]);
    } finally {
      setLoading(false);
    }
  }, [setCampaigns]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { campaigns, loading, refresh };
}

