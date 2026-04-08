import { Queue } from "bullmq";

export const demoParseQueue = new Queue("demo-parse", {
  connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
});
