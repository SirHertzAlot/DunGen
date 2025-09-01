import { Redis } from "ioredis";
import { HealthCheckFn } from "../healthChecker";

export function makeRedisHealthCheck(redisClient: Redis): HealthCheckFn {
  return async () => {
    try {
      const reply = await redisClient.ping();
      return {
        service: "redis",
        healthy: reply === "PONG",
        message: reply,
      };
    } catch (e) {
      return {
        service: "redis",
        healthy: false,
        message: (e as Error).message,
      };
    }
  };
}
