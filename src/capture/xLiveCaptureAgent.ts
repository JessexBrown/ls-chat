import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntegrationStatusStore } from "../server/workers/status";
import {
  findChromeExecutable,
  XLiveChatCaptureWorker,
  xLiveChatChannelFromInput,
  xLiveChatUrlFromInput
} from "../server/workers/xLiveChatCapture";
import type { ChatMessage } from "../shared/chat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

type CapturePayload = {
  platformMessageId: string;
  platformUserId: string | null;
  username: string;
  displayName: string | null;
  channelId: string | null;
  channelName: string | null;
  message: string;
  avatarUrl: string | null;
  sentAt: string | null;
  capturedAt: string;
  sourceUrl: string | null;
};

const endpoint =
  process.env.X_LIVE_CAPTURE_ENDPOINT ??
  process.env.MARKETBUBBLE_CAPTURE_ENDPOINT ??
  `http://localhost:${process.env.PORT ?? 4200}/api/capture/x-live`;
const token = process.env.X_LIVE_CAPTURE_TOKEN ?? "";
const captureTargetsEnv = process.env.X_CAPTURE_AGENT_TARGETS?.trim()
  ? process.env.X_CAPTURE_AGENT_TARGETS
  : process.env.X_LIVE_CHAT_TARGETS;
const targets = splitDelimitedEnv(captureTargetsEnv);
const chromePath = findChromeExecutable(process.env.X_LIVE_CHAT_CHROME_PATH);
const profilePath = path.resolve(projectRoot, process.env.X_LIVE_CHAT_PROFILE_DIR ?? ".data/x-live-chat-profile");
const debugPort = parsePositiveIntegerEnv("X_LIVE_CHAT_DEBUG_PORT", 9223);
const scanMs = parsePositiveIntegerEnv("X_LIVE_CHAT_SCAN_MS", 1200);
const queueLimit = parsePositiveIntegerEnv("X_CAPTURE_AGENT_QUEUE_LIMIT", 1000);
const dryRun = process.env.X_CAPTURE_AGENT_DRY_RUN === "true";
const statuses = new IntegrationStatusStore();
const workers: XLiveChatCaptureWorker[] = [];
const queue: CapturePayload[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;

if (!endpointIsUsable(endpoint)) {
  fail(`X capture endpoint is invalid: ${endpoint}`);
}

if (targets.length === 0) {
  fail("No X targets configured. Set X_CAPTURE_AGENT_TARGETS or X_LIVE_CHAT_TARGETS.");
}

if (!chromePath) {
  fail("Chrome or Edge was not found. Set X_LIVE_CHAT_CHROME_PATH to the browser executable.");
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        endpoint,
        tokenRequired: Boolean(token),
        targetCount: targets.length,
        targets: targets.map((target) => ({
          input: target,
          targetUrl: xLiveChatUrlFromInput(target),
          channelName: xLiveChatChannelFromInput(target)
        })),
        chromePath,
        profilePath,
        debugPort,
        scanMs,
        queueLimit
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(`Starting Market Bubble X capture agent for ${targets.length} target(s).`);
console.log(`Posting captured X chat to ${endpoint}.`);
console.log("This process is operator-side only. Public viewers should never run it.");

for (const target of targets) {
  await startTarget(target);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function startTarget(target: string) {
  const targetUrl = xLiveChatUrlFromInput(target);
  const channelName = xLiveChatChannelFromInput(target);
  const worker = new XLiveChatCaptureWorker({
    targetUrl,
    channelName,
    chromePath: chromePath as string,
    userDataDir: profilePath,
    debugPort,
    scanMs,
    publish: enqueueMessage,
    statuses
  });

  try {
    await worker.start();
    workers.push(worker);
    console.log(`X capture worker connected: ${channelName} (${targetUrl})`);
  } catch (error) {
    console.error(`X capture worker failed for ${target}: ${String(error)}`);
  }
}

function enqueueMessage(message: ChatMessage | null) {
  if (!message) {
    return false;
  }

  queue.push(toCapturePayload(message));
  if (queue.length > queueLimit) {
    queue.splice(0, queue.length - queueLimit);
  }
  scheduleFlush();
  return true;
}

function toCapturePayload(message: ChatMessage): CapturePayload {
  return {
    platformMessageId: message.platformMessageId,
    platformUserId: message.platformUserId,
    username: message.username,
    displayName: message.displayName,
    channelId: message.channelId,
    channelName: message.channelName,
    message: message.message,
    avatarUrl: message.avatarUrl,
    sentAt: message.sentAt,
    capturedAt: new Date().toISOString(),
    sourceUrl: message.sourceUrl
  };
}

function scheduleFlush() {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, 350);
  flushTimer.unref?.();
}

async function flushQueue() {
  if (flushing || queue.length === 0) {
    return;
  }

  flushing = true;
  const batch = queue.splice(0, 50);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["X-LS-Chat-Capture-Token"] = token;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        token: token || undefined,
        messages: batch
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      queue.unshift(...batch);
      console.warn(`X capture post failed with ${response.status}: ${body}`);
      scheduleFlush();
      return;
    }

    const result = (await response.json().catch(() => null)) as { added?: number; received?: number } | null;
    console.log(`Posted ${result?.added ?? batch.length}/${result?.received ?? batch.length} X chat message(s).`);
  } catch (error) {
    queue.unshift(...batch);
    console.warn(`X capture post failed: ${String(error)}`);
    scheduleFlush();
  } finally {
    flushing = false;
  }
}

function shutdown() {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  for (const worker of workers) {
    worker.stop();
  }
  process.exit(0);
}

function splitDelimitedEnv(value: string | undefined) {
  return (value ?? "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function endpointIsUsable(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
