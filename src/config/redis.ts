import { Redis } from "ioredis";
import { env } from "./env.js";

export let redis: Redis | null = null;

export async function connectRedis() {
  if (env.NODE_ENV === "test") return;

  redis = new Redis(env.REDIS_URL, {
    keyPrefix: `${env.REDIS_PREFIX}:`,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  await redis.connect();
}
