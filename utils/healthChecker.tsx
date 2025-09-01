import { Request, Response, NextFunction } from "express";
import { ILogger } from "../logging/logger";
import { makeRedisHealthCheck } from "./healthchecks/redisHealthCheck";
import { Redis } from "ioredis";

export interface HealthCheckResult {
  service: string;
  healthy: boolean;
  message?: string;
  [key: string]: any;
}

export type HealthCheckFn = () => Promise<HealthCheckResult>;

export function healthCheckerMiddleware(
  healthChecks: HealthCheckFn[],
  logger: ILogger,
  redisClient: Redis,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const currentDateTime = new Date();
    const formattedDateTime = `${currentDateTime.getFullYear()}-${String(currentDateTime.getMonth() + 1).padStart(2, "0")}-${String(currentDateTime.getDate()).padStart(2, "0")} ${String(currentDateTime.getHours()).padStart(2, "0")}:${String(currentDateTime.getMinutes()).padStart(2, "0")}:${String(currentDateTime.getSeconds()).padStart(2, "0")}`;
    healthChecks = [
      makeRedisHealthCheck(redisClient),
      // Add other health checks here
    ];
    const results: HealthCheckResult[] = [];
    let allHealthy = true;

    for (const check of healthChecks) {
      try {
        const result = await check();
        results.push(result);
        if (!result.healthy) allHealthy = false;
        logger.healthCheck?.(
          `[${result.service}] ${result.healthy ? "Healthy" : "Unhealthy"}: ${result.message ?? ""} @ ${formattedDateTime}`,
        );
      } catch (err) {
        allHealthy = false;
        const errorResult: HealthCheckResult = {
          service: "unknown",
          healthy: false,
          message: (err as Error).message,
        };
        results.push(errorResult);
        logger.error?.(
          `Health check threw: ${(err as Error).message} @ ${formattedDateTime}`,
          err as Error,
        );
      }
    }

    if (allHealthy) {
      return res.status(200).json({
        status: "ok",
        results,
        timestamp: formattedDateTime,
      });
    } else {
      return res.status(500).json({
        status: "error",
        results,
        timestamp: formattedDateTime,
      });
    }
  };
}
