import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

type HealthResponse = {
  // common shapes we might get from /api/health
  status?: string;
  success?: boolean;
  data?: { status?: string } | any;
  [key: string]: any;
};

interface Props {
  endpoint?: string;
  pollIntervalMs?: number;
}

/**
 * SystemHealthBadge
 * - Encapsulates the react-query call to /api/health (or a custom endpoint)
 * - Attempts to handle a few common response shapes:
 *     { status: "ok" }
 *     { success: true, data: { status: "ok" } }
 *     { success: true }
 * - Renders a small Badge with appropriate variant and label.
 */
export default function SystemHealthBadge({
  endpoint = "/api/health",
  pollIntervalMs = 2000,
}: Props) {
  const { data, isLoading, isError } = useQuery<HealthResponse>({
    queryKey: [endpoint],
    queryFn: async () => {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    },
    refetchInterval: pollIntervalMs,
  });

  // Resolve the API-level status by checking common shapes
  const apiStatus =
    data?.status ??
    data?.data?.status ??
    (data?.success === true ? "ok" : undefined);

  const online =
    apiStatus === "ok" ||
    apiStatus === "online" ||
    apiStatus === "connected" ||
    data?.success === true;

  const label = isLoading
    ? "Checking"
    : isError
      ? "Offline"
      : online
        ? "Online"
        : "Offline";
  const variant = isLoading ? "secondary" : online ? "default" : "destructive";

  return <Badge variant={variant}>{label}</Badge>;
}
