import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

type HealthResponse = {
  status?: string;
  success?: boolean;
  data?: { status?: string } | any;
  [key: string]: any;
};

interface Props {
  endpoint?: string;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
}

/**
 * SystemHealthBadge
 * - Encapsulates the react-query call to /api/health (or a custom endpoint)
 * - Implements AbortController timeout to avoid hung requests
 * - Emits console.debug diagnostics for easier troubleshooting
 */
export function SystemHealthBadge({
  endpoint = "/api/health",
  pollIntervalMs = 2000,
  requestTimeoutMs = 5000,
}: Props) {
  const queryFn = async ({ signal }: { signal?: AbortSignal }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const mergedSignal = signal ?? controller.signal;
      const res = await fetch(endpoint, { signal: mergedSignal });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.debug("[SystemHealthBadge] fetch non-OK", endpoint, res.status, text);
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      console.debug("[SystemHealthBadge] fetch success", endpoint, json);
      return json as HealthResponse;
    } catch (err) {
      clearTimeout(timeout);
      console.debug("[SystemHealthBadge] fetch error", endpoint, err);
      throw err;
    }
  };

  const { data, isLoading, isError, isFetching } = useQuery<HealthResponse>(
    [endpoint],
    queryFn,
    {
      refetchInterval: pollIntervalMs,
      retry: 1,
      staleTime: 1000,
    }
  );

  const apiStatus =
    data?.status ?? data?.data?.status ?? (data?.success === true ? "ok" : undefined);

  const online =
    apiStatus === "ok" || apiStatus === "online" || apiStatus === "connected" || data?.success === true;

  let label = "Checking";
  let variant: React.ComponentProps<typeof Badge>["variant"] = "secondary";

  if (isLoading) {
    label = "Checking";
    variant = "secondary";
  } else if (isError) {
    label = "Offline";
    variant = "destructive";
  } else if (online) {
    label = isFetching ? "Online • Updating" : "Online";
    variant = "default";
  } else {
    label = isFetching ? "Offline • Updating" : "Offline";
    variant = "destructive";
  }

  return <Badge variant={variant}>{label}</Badge>;
}

export default SystemHealthBadge;