#!/usr/bin/env node
/**
 * Development server starter
 * Starts Next.js app with in-memory queue system
 * 
 * Note: For production, install Redis and use BullMQ:
 *   - npm install bullmq ioredis
 *   - Install Redis locally or use Upstash Redis
 *   - Add REDIS_URL=redis://localhost:6379 to .env
 *   - Run npm run worker in a separate terminal
 */
import { spawn } from "child_process";

console.log("=".repeat(50));
console.log("[DEV] Starting Schedly Development Server");
console.log("=".repeat(50));
console.log("\nUsing in-memory job queue (no Redis required)");
console.log("For production with Redis: see QUEUE_SETUP.md\n");

const nextProcess = spawn("npx", ["next", "dev", "-p", "3000"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

console.log("[DEV] Next.js server starting on http://localhost:3000");

const shutdown = () => {
  console.log("\n[DEV] Shutting down...");
  nextProcess.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
