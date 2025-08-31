import { Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { ILogger } from "../logging/logger";
/**
 * Checks the health of a ioredis client by performing PING command.
 * @param redisClient - The ioredis client instance to check.
 * @returns A promise that resolves to true if the client is healthy, false otherwise.
 */

export const healthCheckerMiddleware = (
  redisClient: Redis,
  logger: ILogger,
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const currentDateTime = new Date();
    const formattedDateTime = `${currentDateTime.getFullYear()}-${currentDateTime.getMonth() + 1}-${currentDateTime.getDate()} ${currentDateTime.getHours()}:${currentDateTime.getMinutes()}:${currentDateTime.getSeconds()}`;
    let reply: string | undefined;
    try {
      reply = await redisClient.ping();

      console.log(
        `Redis server responded with ${reply} @ ${formattedDateTime}.`,
      );
      if (reply != "PONG") {
        logger.error(
          `Redis server did not respond @ ${formattedDateTime}. Please make sure the server is online.`,
        );
        return res.status(500).json({
          status: "error",
          message: "Redis server did not respond.",
          timestamp: formattedDateTime,
        });
      } else {
        logger.healthCheck(
          `Redis server responded with PONG @ ${formattedDateTime}.`,
        );
        res.status(200).json({
          status: "ok",
          message: "Redis server is healthy.",
          timestamp: formattedDateTime,
        });
        next();
      }
    } catch (error) {
      logger.error(
        `Redis server seems to be down... @ ${formattedDateTime}. Please check the server status.`,
        error as Error,
        { component: "redis", reply },
      );
      return res.status(500).json({
        status: `${error}`,
        message: "Redis server seems to be down...",
        timestamp: formattedDateTime,
      });
    }
  };
};
