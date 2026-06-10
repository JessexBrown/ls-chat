import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";
import { createServer as createHttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { z } from "zod";
import { normalizeKickChatMessage } from "./adapters/kick";
import { normalizeTwitchChatMessage } from "./adapters/twitch";
import { normalizeXFilteredStreamPost, normalizeXLiveCaptureMessage } from "./adapters/x";
import { createDemoMessage } from "./demo";
import { ChatHub } from "./hub";
import { LiveSessionStore, liveSessionUpdateSchema } from "./liveSession";
import { createNativeChatMessage, nativeChatInputSchema } from "./nativeChat";
import { buildPublicDashboardConfig } from "./publicDashboard";
import { SourceHub } from "./sourceHub";
import { verifyKickSignature, verifyTwitchSignature, type RawBodyRequest } from "./security";
import { subscribeKickChatWebhook } from "./workers/kickSubscriptions";
import { IntegrationStatusStore } from "./workers/status";
import { TwitchEventSubWorker } from "./workers/twitchEventSub";
import { parseXRules, XFilteredStreamWorker } from "./workers/xFilteredStream";
import { findChromeExecutable, XLiveChatCaptureWorker, xLiveChatChannelFromInput, xLiveChatUrlFromInput } from "./workers/xLiveChatCapture";
import { chatMessageSchema, makeMessageId, platformSchema, textFragment, type ChatMessage, type Platform } from "../shared/chat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const envFilePath = path.join(projectRoot, ".env");
const envLoadResult = dotenv.config({ path: envFilePath });
const twitchSessionPath = process.env.TWITCH_SESSION_FILE
  ? path.resolve(projectRoot, process.env.TWITCH_SESSION_FILE)
  : path.join(projectRoot, ".data", "twitch-session.json");
const kickSessionPath = process.env.KICK_SESSION_FILE
  ? path.resolve(projectRoot, process.env.KICK_SESSION_FILE)
  : path.join(projectRoot, ".data", "kick-session.json");
const liveSessionPath = process.env.LIVE_SESSION_FILE
  ? path.resolve(projectRoot, process.env.LIVE_SESSION_FILE)
  : path.join(projectRoot, ".data", "live-session.json");
const xLiveChatProfilePath = process.env.X_LIVE_CHAT_PROFILE_DIR
  ? path.resolve(projectRoot, process.env.X_LIVE_CHAT_PROFILE_DIR)
  : path.join(projectRoot, ".data", "x-live-chat-profile");
const port = Number(process.env.PORT ?? 4200);
const isProduction = process.env.NODE_ENV === "production";
const messageHistoryLimit = parsePositiveIntegerEnv("CHAT_HISTORY_LIMIT", 500);
const viewerPollMs = parsePositiveIntegerEnv("VIEWER_POLL_MS", 30000);
const nativeChatRateLimit = parsePositiveIntegerEnv("NATIVE_CHAT_RATE_LIMIT", 8);
const nativeChatRateWindowMs = parsePositiveIntegerEnv("NATIVE_CHAT_RATE_WINDOW_MS", 10000);
const marketBubbleSourceId = "marketbubble:native-live";
const publicStreamEmbedUrl = process.env.MARKETBUBBLE_STREAM_EMBED_URL ?? "";
const publicStreamWatchUrl = process.env.MARKETBUBBLE_STREAM_WATCH_URL ?? "";
const defaultXLiveCaptureAllowedOrigins = [
  "https://x.com",
  "https://twitter.com",
  "https://mobile.x.com",
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`
].join(",");
const xLiveCaptureAllowedOrigins = new Set(
  (process.env.X_LIVE_CAPTURE_ALLOWED_ORIGINS ?? defaultXLiveCaptureAllowedOrigins)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const xLiveCaptureExtensionOriginsAllowed = process.env.X_LIVE_CAPTURE_ALLOW_EXTENSION_ORIGINS !== "false";
const storedTwitchSessionPresent = fs.existsSync(twitchSessionPath);
const storedKickSessionPresent = fs.existsSync(kickSessionPath);
const realIngestionEnabled =
  process.env.TWITCH_EVENTSUB_ENABLED === "true" ||
  storedTwitchSessionPresent ||
  storedKickSessionPresent ||
  process.env.KICK_AUTO_SUBSCRIBE === "true" ||
  process.env.X_STREAM_ENABLED === "true";
const demoEnabled =
  process.env.DEMO_CHAT_FORCE === "true" || (!realIngestionEnabled && process.env.DEMO_CHAT_ENABLED !== "false");

const app = express();
const hub = new ChatHub(messageHistoryLimit);
const sourceHub = new SourceHub();
const liveSessionStore = new LiveSessionStore({
  filePath: liveSessionPath,
  defaults: {
    id: "default",
    title: process.env.MARKETBUBBLE_DASHBOARD_TITLE ?? "MarketBubble Live",
    nativeChatLabel: process.env.MARKETBUBBLE_CHAT_LABEL ?? "MarketBubble",
    streamEmbedUrl: absoluteUrlOrNull(publicStreamEmbedUrl),
    streamWatchUrl: absoluteUrlOrNull(publicStreamWatchUrl),
    description: ""
  }
});
const statuses = new IntegrationStatusStore();
const httpServer = createHttpServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const publicViewerSockets = new Set<unknown>();
const nativeChatRateBuckets = new Map<string, number[]>();

const mockMessageSchema = z.object({
  platform: platformSchema.default("twitch"),
  username: z.string().min(1).default("localtester"),
  message: z.string().min(1),
  channelName: z.string().min(1).optional()
});

const kickSubscribeSchema = z.object({
  broadcaster: z.string().trim().min(1).optional(),
  broadcasterSlug: z.string().trim().min(1).optional(),
  broadcasterUserId: z.string().trim().min(1).optional()
});

const kickTargetSchema = z.object({
  target: z.string().trim().min(1)
});

const integrationTargetSchema = z.object({
  target: z.string().trim().min(1)
});

const xRulesSchema = z.object({
  rules: z.string().trim()
});

const xLiveChatStartSchema = z
  .object({
    username: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    channelName: z.string().trim().min(1).optional()
  })
  .refine((value) => value.username || value.url, "Provide username or url.");

const xLiveCaptureSchema = z
  .object({
    platformMessageId: z.string().trim().min(1).optional(),
    platformUserId: z.string().trim().min(1).nullable().optional(),
    username: z.string().trim().min(1),
    displayName: z.string().trim().min(1).nullable().optional(),
    channelId: z.string().trim().min(1).nullable().optional(),
    channelName: z.string().trim().min(1).nullable().optional(),
    message: z.string().trim().min(1),
    avatarUrl: z.string().url().nullable().optional(),
    sentAt: z.string().datetime().nullable().optional(),
    capturedAt: z.string().datetime().optional(),
    sourceUrl: z.string().url().optional()
  })
  .passthrough();

const xLiveCaptureBatchSchema = z.union([
  xLiveCaptureSchema,
  z
    .object({
      token: z.string().optional(),
      sourceUrl: z.string().url().optional(),
      channelName: z.string().trim().min(1).optional(),
      messages: z.array(xLiveCaptureSchema).min(1).max(50)
    })
    .passthrough()
]);
type XLiveCapturePayload = z.infer<typeof xLiveCaptureSchema>;
type XLiveCaptureBatchPayload = {
  token?: string;
  sourceUrl?: string;
  channelName?: string;
  messages: XLiveCapturePayload[];
};

const twitchBroadcasterSchema = z
  .object({
    login: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1).optional()
  })
  .refine((value) => value.login || value.userId, "Provide login or userId.");

app.use(
  express.json({
    limit: "1mb",
    verify: (req: RawBodyRequest, _res, buffer) => {
      req.rawBody = buffer.toString("utf8");
    }
  })
);

function publish(message: ChatMessage | null) {
  if (!message) {
    return false;
  }

  const enriched = enrichMessageSource(message);
  const added = hub.add(enriched);
  upsertSourceFromMessage(enriched);
  return added;
}

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function applyXLiveCaptureCors(req: Request, res: Response) {
  const origin = req.header("Origin");
  if (origin && xLiveCaptureOriginAllowedValue(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-LS-Chat-Capture-Token");
  res.setHeader("Access-Control-Max-Age", "3600");
}

function xLiveCaptureOriginAllowedValue(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  return (
    xLiveCaptureAllowedOrigins.has(origin) ||
    (xLiveCaptureExtensionOriginsAllowed &&
      (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")))
  );
}

function xLiveCaptureOriginAllowed(req: Request) {
  return xLiveCaptureOriginAllowedValue(req.header("Origin"));
}

function xLiveCaptureTokenValid(req: Request, bodyToken?: string | null) {
  const expectedToken = process.env.X_LIVE_CAPTURE_TOKEN;
  return !expectedToken || req.header("X-LS-Chat-Capture-Token") === expectedToken || bodyToken === expectedToken;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

function isEnabled(name: string) {
  return process.env[name] === "true";
}

const platformLabels: Record<Platform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  marketbubble: "MarketBubble"
};

function sourceKey(value: string | null | undefined) {
  return (value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function absoluteUrlOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return null;
  }
}

function sourceUrlForMessage(message: ChatMessage) {
  if (isDevelopmentMessage(message)) {
    return null;
  }

  const explicitUrl = absoluteUrlOrNull(message.sourceUrl);
  if (explicitUrl) {
    return explicitUrl;
  }

  if (message.platform === "twitch") {
    const login = message.channelName && !/^\d+$/.test(message.channelName) ? message.channelName : null;
    return login ? `https://www.twitch.tv/${login}` : null;
  }

  if (message.platform === "kick") {
    const slug = message.channelName && !/^\d+$/.test(message.channelName) ? message.channelName : null;
    return slug ? `https://kick.com/${slug}` : null;
  }

  if (message.platform === "x") {
    const channelUrl = absoluteUrlOrNull(message.channelId);
    if (channelUrl) {
      return channelUrl;
    }

    const account = message.channelName?.replace(/^@/, "").replace(/\s+livechat$/i, "");
    return account ? `https://x.com/${account}/livechat` : null;
  }

  return liveSessionStore.get().streamWatchUrl;
}

function currentMarketBubbleSourceLabel() {
  return liveSessionStore.get().nativeChatLabel;
}

function sourceIdForPlatform(platform: Platform, channelId: string | null | undefined, channelName: string | null | undefined, fallback: string) {
  return platform === "marketbubble" ? marketBubbleSourceId : `${platform}:${sourceKey(channelId ?? channelName ?? fallback)}`;
}

function isDevelopmentMessage(message: Pick<ChatMessage, "channelId" | "platformMessageId" | "sourceId">) {
  return (
    message.channelId === "local-dev-channel" ||
    message.platformMessageId.startsWith("mock-") ||
    message.sourceId?.startsWith("local-dev:") === true
  );
}

function enrichMessageSource(message: ChatMessage) {
  const parsed = chatMessageSchema.parse(message);
  const sourceLabel =
    parsed.sourceLabel ??
    (parsed.platform === "marketbubble" ? currentMarketBubbleSourceLabel() : parsed.channelName) ??
    platformLabels[parsed.platform];
  const sourceId =
    parsed.sourceId ??
    sourceIdForPlatform(parsed.platform, parsed.channelId, parsed.channelName, sourceLabel);
  const sourceUrl = sourceUrlForMessage({ ...parsed, sourceLabel, sourceId });

  return chatMessageSchema.parse({
    ...parsed,
    sourceId,
    sourceLabel,
    sourceUrl
  });
}

function upsertSourceFromMessage(message: ChatMessage) {
  if (!message.sourceId || !message.sourceLabel || isDevelopmentMessage(message)) {
    return;
  }

  sourceHub.upsert({
    id: message.sourceId,
    platform: message.platform,
    label: message.sourceLabel,
    channelId: message.channelId,
    channelName: message.channelName,
    sourceUrl: message.sourceUrl,
    status: message.platform === "marketbubble" ? "live" : "connected"
  });
}

function updateMarketBubbleViewerSource() {
  sourceHub.upsert({
    id: marketBubbleSourceId,
    platform: "marketbubble",
    label: currentMarketBubbleSourceLabel(),
    channelId: "marketbubble-native-live",
    channelName: currentMarketBubbleSourceLabel(),
    sourceUrl: liveSessionStore.get().streamWatchUrl,
    viewerCount: publicViewerSockets.size,
    status: "live",
    detail: "Native dashboard viewers"
  });
}

function nativeChatClientId(req: Request, nativeClientId?: string) {
  const forwardedFor = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  const networkId = forwardedFor || req.ip || req.socket.remoteAddress || "unknown";
  return nativeClientId ? `${networkId}:${nativeClientId}` : networkId;
}

function canPostNativeChat(clientId: string) {
  const now = Date.now();
  const recentPosts = (nativeChatRateBuckets.get(clientId) ?? []).filter(
    (timestamp) => now - timestamp < nativeChatRateWindowMs
  );

  if (recentPosts.length >= nativeChatRateLimit) {
    nativeChatRateBuckets.set(clientId, recentPosts);
    return false;
  }

  recentPosts.push(now);
  nativeChatRateBuckets.set(clientId, recentPosts);

  if (nativeChatRateBuckets.size > 1000) {
    for (const [key, timestamps] of nativeChatRateBuckets.entries()) {
      const activeTimestamps = timestamps.filter((timestamp) => now - timestamp < nativeChatRateWindowMs);
      if (activeTimestamps.length === 0) {
        nativeChatRateBuckets.delete(key);
      } else {
        nativeChatRateBuckets.set(key, activeTimestamps);
      }
    }
  }

  return true;
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOauthScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string");
  }

  if (typeof value === "string") {
    return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  }

  return [];
}

function hasOauthScope(scopes: string[], scope: string) {
  return scopes.includes(scope);
}

function expiresAtFromExpiresIn(expiresIn: number | undefined) {
  return typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

function createPkceChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

statuses.set("twitch", "disabled", "Set TWITCH_EVENTSUB_ENABLED=true with Twitch credentials to start real chat.");
statuses.set("kick", "disabled", "Kick chat is received through /api/webhooks/kick after webhook subscription.");
statuses.set("x", "disabled", "Set X_STREAM_ENABLED=true with X_BEARER_TOKEN to stream public posts.");

type TwitchRuntimeConfig = {
  clientId: string | null;
  clientSecret: string | null;
  userAccessToken: string | null;
  refreshToken: string | null;
  scopes: string[];
  userId: string | null;
  userLogin: string | null;
  broadcasterUserId: string | null;
  broadcasterLogin: string | null;
  trackedBroadcasters: TwitchTrackedBroadcaster[];
};

type TwitchTrackedBroadcaster = {
  userId: string;
  login: string | null;
  displayName: string | null;
  addedAt: string;
  updatedAt: string;
};

type TwitchStoredSession = {
  version: 1;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: string | null;
  user: {
    id: string;
    login: string;
  };
  broadcaster: {
    id: string;
    login: string | null;
  };
  trackedBroadcasters?: TwitchTrackedBroadcaster[];
  updatedAt: string;
};

type KickRuntimeConfig = {
  clientId: string | null;
  clientSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  appAccessToken: string | null;
  appTokenExpiresAt: string | null;
  scopes: string[];
  expiresAt: string | null;
  broadcasterUserId: string | null;
  broadcasterSlug: string | null;
  broadcasterName: string | null;
  trackedBroadcasters: KickTrackedBroadcaster[];
  tokenSource: "env" | "oauth" | null;
  ingestionEnabled: boolean;
};

type KickTrackedBroadcaster = {
  userId: string;
  slug: string | null;
  name: string | null;
  subscriptionIds: string[];
  addedAt: string;
  updatedAt: string;
};

type KickStoredSession = {
  version: 1;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: string | null;
  broadcaster: {
    id: string | null;
    slug: string | null;
    name: string | null;
  };
  trackedBroadcasters?: KickTrackedBroadcaster[];
  updatedAt: string;
};

let twitchRuntimeConfig: TwitchRuntimeConfig = {
  clientId: process.env.TWITCH_CLIENT_ID ?? null,
  clientSecret: process.env.TWITCH_CLIENT_SECRET ?? null,
  userAccessToken: process.env.TWITCH_USER_ACCESS_TOKEN ?? null,
  refreshToken: null,
  scopes: [],
  userId: process.env.TWITCH_USER_ID ?? null,
  userLogin: null,
  broadcasterUserId: process.env.TWITCH_BROADCASTER_USER_ID ?? null,
  broadcasterLogin: null,
  trackedBroadcasters: process.env.TWITCH_BROADCASTER_USER_ID
    ? [
        {
          userId: process.env.TWITCH_BROADCASTER_USER_ID,
          login: null,
          displayName: null,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    : []
};
let kickRuntimeConfig: KickRuntimeConfig = {
  clientId: process.env.KICK_CLIENT_ID ?? null,
  clientSecret: process.env.KICK_CLIENT_SECRET ?? null,
  accessToken: process.env.KICK_ACCESS_TOKEN ?? null,
  refreshToken: null,
  appAccessToken: process.env.KICK_ACCESS_TOKEN ?? null,
  appTokenExpiresAt: null,
  scopes: [],
  expiresAt: null,
  broadcasterUserId: process.env.KICK_BROADCASTER_USER_ID ?? null,
  broadcasterSlug: null,
  broadcasterName: null,
  trackedBroadcasters: process.env.KICK_BROADCASTER_USER_ID
    ? [
        {
          userId: process.env.KICK_BROADCASTER_USER_ID,
          slug: null,
          name: process.env.KICK_BROADCASTER_USER_ID,
          subscriptionIds: [],
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    : [],
  tokenSource: process.env.KICK_ACCESS_TOKEN ? "env" : null,
  ingestionEnabled: process.env.KICK_INGESTION_ENABLED !== "false"
};
let twitchWorker: TwitchEventSubWorker | null = null;
let xWorker: XFilteredStreamWorker | null = null;
const xLiveChatWorkers = new Map<
  string,
  {
    worker: XLiveChatCaptureWorker;
    targetUrl: string;
    channelName: string;
    startedAt: string;
  }
>();
let demoInterval: NodeJS.Timeout | null = null;
const twitchOAuthStates = new Map<string, { createdAt: number }>();
const kickOAuthStates = new Map<string, { createdAt: number; codeVerifier: string }>();

let xRuntimeConfig = {
  bearerToken: process.env.X_BEARER_TOKEN ?? null,
  rawRules: process.env.X_FILTER_RULES ?? "",
  rules: parseXRules(process.env.X_FILTER_RULES)
};

function readStoredTwitchSession() {
  if (!fs.existsSync(twitchSessionPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(twitchSessionPath, "utf8")) as TwitchStoredSession;
  } catch (error) {
    statuses.set("twitch", "error", `Unable to read stored Twitch OAuth session: ${String(error)}`);
    return null;
  }
}

function saveStoredTwitchSession(session: TwitchStoredSession) {
  fs.mkdirSync(path.dirname(twitchSessionPath), { recursive: true });
  fs.writeFileSync(twitchSessionPath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
}

function deleteStoredTwitchSession() {
  if (fs.existsSync(twitchSessionPath)) {
    fs.unlinkSync(twitchSessionPath);
  }
}

function applyStoredTwitchSession(session: TwitchStoredSession) {
  const legacyTrackedBroadcaster =
    session.trackedBroadcasters === undefined
      ? [
          {
            userId: session.broadcaster.id,
            login: session.broadcaster.login,
            displayName: session.broadcaster.login,
            addedAt: session.updatedAt,
            updatedAt: session.updatedAt
          }
        ]
      : [];

  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    userAccessToken: session.accessToken,
    refreshToken: session.refreshToken,
    scopes: session.scopes,
    userId: session.user.id,
    userLogin: session.user.login,
    broadcasterUserId: session.broadcaster.id,
    broadcasterLogin: session.broadcaster.login,
    trackedBroadcasters: session.trackedBroadcasters ?? legacyTrackedBroadcaster
  };
}

function currentStoredTwitchSession(validation?: { login: string; user_id: string; scopes?: string[]; expires_in?: number }) {
  if (!twitchRuntimeConfig.userAccessToken || !twitchRuntimeConfig.userId) {
    return null;
  }

  const scopes = validation?.scopes ?? twitchRuntimeConfig.scopes;
  const userLogin = validation?.login ?? twitchRuntimeConfig.userLogin ?? twitchRuntimeConfig.userId;
  const userId = validation?.user_id ?? twitchRuntimeConfig.userId;
  const expiresAt =
    validation?.expires_in === undefined ? null : new Date(Date.now() + validation.expires_in * 1000).toISOString();

  return {
    version: 1,
    accessToken: twitchRuntimeConfig.userAccessToken,
    refreshToken: twitchRuntimeConfig.refreshToken,
    scopes,
    expiresAt,
    user: {
      id: userId,
      login: userLogin
    },
    broadcaster: {
      id: twitchRuntimeConfig.broadcasterUserId ?? userId,
      login: twitchRuntimeConfig.broadcasterLogin
    },
    trackedBroadcasters: twitchRuntimeConfig.trackedBroadcasters,
    updatedAt: new Date().toISOString()
  } satisfies TwitchStoredSession;
}

function readStoredKickSession() {
  if (!fs.existsSync(kickSessionPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(kickSessionPath, "utf8")) as KickStoredSession;
  } catch (error) {
    statuses.set("kick", "error", `Unable to read stored Kick OAuth session: ${String(error)}`);
    return null;
  }
}

function saveStoredKickSession(session: KickStoredSession) {
  fs.mkdirSync(path.dirname(kickSessionPath), { recursive: true });
  fs.writeFileSync(kickSessionPath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
}

function deleteStoredKickSession() {
  if (fs.existsSync(kickSessionPath)) {
    fs.unlinkSync(kickSessionPath);
  }
}

function applyStoredKickSession(session: KickStoredSession) {
  const legacyTrackedBroadcaster =
    session.trackedBroadcasters === undefined && session.broadcaster.id
      ? [
          {
            userId: session.broadcaster.id,
            slug: session.broadcaster.slug,
            name: session.broadcaster.name,
            subscriptionIds: [],
            addedAt: session.updatedAt,
            updatedAt: session.updatedAt
          }
        ]
      : [];

  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    scopes: session.scopes,
    expiresAt: session.expiresAt,
    broadcasterUserId: session.broadcaster.id,
    broadcasterSlug: session.broadcaster.slug,
    broadcasterName: session.broadcaster.name,
    trackedBroadcasters: session.trackedBroadcasters ?? legacyTrackedBroadcaster,
    tokenSource: "oauth"
  };
}

function currentStoredKickSession() {
  if (!kickRuntimeConfig.accessToken || kickRuntimeConfig.tokenSource !== "oauth") {
    return null;
  }

  return {
    version: 1,
    accessToken: kickRuntimeConfig.accessToken,
    refreshToken: kickRuntimeConfig.refreshToken,
    scopes: kickRuntimeConfig.scopes,
    expiresAt: kickRuntimeConfig.expiresAt,
    broadcaster: {
      id: kickRuntimeConfig.broadcasterUserId,
      slug: kickRuntimeConfig.broadcasterSlug,
      name: kickRuntimeConfig.broadcasterName
    },
    trackedBroadcasters: kickRuntimeConfig.trackedBroadcasters,
    updatedAt: new Date().toISOString()
  } satisfies KickStoredSession;
}

function twitchCredentialsPresent() {
  return {
    clientId: Boolean(twitchRuntimeConfig.clientId),
    userAccessToken: Boolean(twitchRuntimeConfig.userAccessToken),
    broadcasterUserId: Boolean(twitchRuntimeConfig.broadcasterUserId),
    trackedBroadcasters: twitchRuntimeConfig.trackedBroadcasters.length > 0,
    userId: Boolean(twitchRuntimeConfig.userId)
  };
}

function canStartTwitch() {
  const credentials = twitchCredentialsPresent();
  return Boolean(
    credentials.clientId &&
      credentials.userAccessToken &&
      credentials.userId &&
      (credentials.broadcasterUserId || credentials.trackedBroadcasters)
  );
}

async function validateTwitchAccessToken(accessToken: string) {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch token validation failed with ${response.status}: ${body}`);
  }

  return (await response.json()) as {
    client_id: string;
    login: string;
    user_id: string;
    scopes?: string[];
    expires_in?: number;
  };
}

async function refreshTwitchAccessToken() {
  if (!twitchRuntimeConfig.clientId || !twitchRuntimeConfig.clientSecret || !twitchRuntimeConfig.refreshToken) {
    throw new Error("Missing Twitch client ID, client secret, or refresh token.");
  }

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: twitchRuntimeConfig.clientId,
      client_secret: twitchRuntimeConfig.clientSecret,
      grant_type: "refresh_token",
      refresh_token: twitchRuntimeConfig.refreshToken
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch token refresh failed with ${response.status}: ${body}`);
  }

  const token = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string[];
  };

  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    userAccessToken: token.access_token,
    refreshToken: token.refresh_token ?? twitchRuntimeConfig.refreshToken,
    scopes: token.scope ?? twitchRuntimeConfig.scopes
  };

  return token;
}

async function ensureTwitchTokenIsUsable() {
  if (!twitchRuntimeConfig.userAccessToken) {
    return { ok: false, refreshed: false };
  }

  let validation = await validateTwitchAccessToken(twitchRuntimeConfig.userAccessToken);
  let refreshed = false;

  if (!validation && twitchRuntimeConfig.refreshToken) {
    await refreshTwitchAccessToken();
    refreshed = true;
    validation = await validateTwitchAccessToken(twitchRuntimeConfig.userAccessToken!);
  }

  if (!validation) {
    statuses.set("twitch", "error", "Stored Twitch OAuth token is invalid. Reconnect Twitch with OAuth.");
    return { ok: false, refreshed };
  }

  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    userId: validation.user_id,
    userLogin: validation.login,
    scopes: validation.scopes ?? twitchRuntimeConfig.scopes,
    broadcasterUserId: twitchRuntimeConfig.broadcasterUserId ?? validation.user_id,
    broadcasterLogin: twitchRuntimeConfig.broadcasterLogin ?? validation.login
  };

  if (twitchRuntimeConfig.refreshToken) {
    const session = currentStoredTwitchSession(validation);
    if (session) {
      saveStoredTwitchSession(session);
    }
  }

  return { ok: true, refreshed };
}

async function getTwitchUsers(params: { login?: string; id?: string }) {
  if (!twitchRuntimeConfig.clientId || !twitchRuntimeConfig.userAccessToken) {
    throw new Error("Twitch client ID and user access token are required for user lookup.");
  }

  const query = new URLSearchParams();
  if (params.login) {
    query.set("login", params.login.toLowerCase());
  }
  if (params.id) {
    query.set("id", params.id);
  }

  const response = await fetch(`https://api.twitch.tv/helix/users?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${twitchRuntimeConfig.userAccessToken}`,
      "Client-Id": twitchRuntimeConfig.clientId
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch user lookup failed with ${response.status}: ${body}`);
  }

  const body = (await response.json()) as {
    data?: Array<{ id: string; login: string; display_name: string; profile_image_url?: string }>;
  };

  return body.data ?? [];
}

function normalizeTwitchTargetKey(value: string | null | undefined) {
  return value ? value.trim().toLowerCase() : "";
}

function upsertTwitchTrackedBroadcaster(target: { id: string; login: string | null; displayName?: string | null }) {
  const now = new Date().toISOString();
  const existing = twitchRuntimeConfig.trackedBroadcasters.find((tracked) => tracked.userId === target.id);
  const nextTarget: TwitchTrackedBroadcaster = {
    userId: target.id,
    login: target.login,
    displayName: target.displayName ?? target.login,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now
  };

  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    trackedBroadcasters: [
      ...twitchRuntimeConfig.trackedBroadcasters.filter((tracked) => tracked.userId !== target.id),
      nextTarget
    ]
  };

  const session = currentStoredTwitchSession();
  if (session) {
    saveStoredTwitchSession(session);
  }

  sourceHub.upsert({
    id: sourceIdForPlatform("twitch", nextTarget.userId, nextTarget.login ?? nextTarget.displayName, "Twitch"),
    platform: "twitch",
    label: nextTarget.displayName ?? nextTarget.login ?? nextTarget.userId,
    channelId: nextTarget.userId,
    channelName: nextTarget.login ?? nextTarget.displayName,
    sourceUrl: nextTarget.login ? `https://www.twitch.tv/${nextTarget.login}` : null,
    status: "unknown"
  });

  return nextTarget;
}

function removeTwitchTrackedBroadcaster(target: string) {
  const normalizedTarget = normalizeTwitchTargetKey(target);
  const removed = twitchRuntimeConfig.trackedBroadcasters.find((tracked) =>
    [tracked.userId, tracked.login, tracked.displayName].some((value) => normalizeTwitchTargetKey(value) === normalizedTarget)
  );

  if (!removed) {
    return null;
  }

  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    trackedBroadcasters: twitchRuntimeConfig.trackedBroadcasters.filter((tracked) => tracked.userId !== removed.userId)
  };
  sourceHub.remove(sourceIdForPlatform("twitch", removed.userId, removed.login ?? removed.displayName, "Twitch"));

  const primaryTarget = twitchRuntimeConfig.trackedBroadcasters.at(-1) ?? null;
  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    broadcasterUserId: primaryTarget?.userId ?? null,
    broadcasterLogin: primaryTarget?.login ?? primaryTarget?.displayName ?? null
  };

  const session = currentStoredTwitchSession();
  if (session) {
    saveStoredTwitchSession(session);
  }

  return removed;
}

function twitchMessageMatchesTrackedBroadcaster(message: ChatMessage) {
  return twitchRuntimeConfig.trackedBroadcasters.some((tracked) => {
    const trackedKeys = [tracked.userId, tracked.login, tracked.displayName].map(normalizeTwitchTargetKey).filter(Boolean);
    const messageKeys = [message.channelId, message.channelName].map(normalizeTwitchTargetKey).filter(Boolean);
    return trackedKeys.some((trackedKey) => messageKeys.includes(trackedKey));
  });
}

async function startOrRestartTwitchWorker() {
  if (!isEnabled("TWITCH_EVENTSUB_ENABLED") && !twitchRuntimeConfig.userAccessToken) {
    statuses.set("twitch", "disabled", "Twitch EventSub is disabled.");
    return false;
  }

  if (!canStartTwitch()) {
    statuses.set("twitch", "error", "Twitch EventSub enabled but required Twitch credentials are missing.");
    return false;
  }

  const tokenResult = await ensureTwitchTokenIsUsable();
  if (!tokenResult.ok) {
    return false;
  }

  if (twitchRuntimeConfig.trackedBroadcasters.length === 0 && twitchRuntimeConfig.broadcasterUserId) {
    upsertTwitchTrackedBroadcaster({
      id: twitchRuntimeConfig.broadcasterUserId,
      login: twitchRuntimeConfig.broadcasterLogin,
      displayName: twitchRuntimeConfig.broadcasterLogin
    });
  }

  const broadcasterUserIds = twitchRuntimeConfig.trackedBroadcasters.map((tracked) => tracked.userId);
  if (broadcasterUserIds.length === 0) {
    statuses.set("twitch", "error", "Twitch has no tracked broadcasters. Add a Twitch broadcaster before starting.");
    return false;
  }

  stopDemoMessages();
  twitchWorker?.stop();
  twitchWorker = new TwitchEventSubWorker({
    clientId: twitchRuntimeConfig.clientId!,
    userAccessToken: twitchRuntimeConfig.userAccessToken!,
    broadcasterUserIds,
    userId: twitchRuntimeConfig.userId!,
    publish: (message) => {
      if (!message || twitchMessageMatchesTrackedBroadcaster(message)) {
        publish(message);
      }
    },
    statuses
  });
  twitchWorker.start();
  return true;
}

function kickCredentialsPresent() {
  return {
    clientId: Boolean(kickRuntimeConfig.clientId),
    clientSecret: Boolean(kickRuntimeConfig.clientSecret),
    accessToken: Boolean(kickRuntimeConfig.accessToken),
    broadcasterUserId: Boolean(kickRuntimeConfig.broadcasterUserId),
    publicKey: Boolean(process.env.KICK_PUBLIC_KEY_PEM),
    webhookUrl: Boolean(process.env.KICK_WEBHOOK_URL)
  };
}

async function refreshKickAccessToken() {
  if (!kickRuntimeConfig.clientId || !kickRuntimeConfig.clientSecret || !kickRuntimeConfig.refreshToken) {
    throw new Error("Missing Kick client ID, client secret, or refresh token.");
  }

  const response = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: kickRuntimeConfig.clientId,
      client_secret: kickRuntimeConfig.clientSecret,
      grant_type: "refresh_token",
      refresh_token: kickRuntimeConfig.refreshToken
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kick token refresh failed with ${response.status}: ${body}`);
  }

  const token = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string[] | string;
  };

  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? kickRuntimeConfig.refreshToken,
    scopes: normalizeOauthScopes(token.scope).length ? normalizeOauthScopes(token.scope) : kickRuntimeConfig.scopes,
    expiresAt: expiresAtFromExpiresIn(token.expires_in) ?? kickRuntimeConfig.expiresAt,
    tokenSource: "oauth"
  };

  const session = currentStoredKickSession();
  if (session) {
    saveStoredKickSession(session);
  }

  return token;
}

async function getKickAppAccessToken() {
  if (
    kickRuntimeConfig.appAccessToken &&
    (!kickRuntimeConfig.appTokenExpiresAt || new Date(kickRuntimeConfig.appTokenExpiresAt).getTime() > Date.now() + 60_000)
  ) {
    return kickRuntimeConfig.appAccessToken;
  }

  if (!kickRuntimeConfig.clientId || !kickRuntimeConfig.clientSecret) {
    throw new Error("Kick client ID and client secret are required to create an app access token.");
  }

  const response = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: kickRuntimeConfig.clientId,
      client_secret: kickRuntimeConfig.clientSecret,
      grant_type: "client_credentials"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kick app token exchange failed with ${response.status}: ${body}`);
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };

  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    appAccessToken: token.access_token,
    appTokenExpiresAt: expiresAtFromExpiresIn(token.expires_in)
  };

  return token.access_token;
}

async function ensureKickTokenIsUsable() {
  if (!kickRuntimeConfig.accessToken) {
    return { ok: false, refreshed: false };
  }

  if (!kickRuntimeConfig.expiresAt || new Date(kickRuntimeConfig.expiresAt).getTime() > Date.now() + 60_000) {
    return { ok: true, refreshed: false };
  }

  if (!kickRuntimeConfig.refreshToken) {
    statuses.set("kick", "error", "Kick access token expired. Reconnect Kick with OAuth or refresh the app token.");
    return { ok: false, refreshed: false };
  }

  await refreshKickAccessToken();
  return { ok: true, refreshed: true };
}

async function getKickAuthenticatedChannel(accessToken: string) {
  const channels = await getKickChannels(accessToken);
  return channels[0] ?? null;
}

function normalizeKickBroadcasterInput(value: string) {
  return value
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(?:www\.)?kick\.com\//i, "")
    .split(/[/?#]/)[0]
    .trim();
}

async function getKickChannels(accessToken: string, params: { broadcasterUserId?: string; slug?: string } = {}) {
  const url = new URL("https://api.kick.com/public/v1/channels");

  if (params.broadcasterUserId) {
    url.searchParams.set("broadcaster_user_id", params.broadcasterUserId);
  }

  if (params.slug) {
    url.searchParams.set("slug", params.slug);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kick channel lookup failed with ${response.status}: ${body}`);
  }

  const body = (await response.json()) as { data?: KickChannelSummary[] };

  return body.data ?? [];
}

type KickChannelSummary = {
  broadcaster_user_id?: number | string;
  slug?: string;
  stream_title?: string;
};

async function resolveKickBroadcaster(input: string | null | undefined) {
  const normalized = input ? normalizeKickBroadcasterInput(input) : "";

  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return {
      userId: normalized,
      slug: null,
      name: normalized
    };
  }

  let lookupToken: string | null = null;
  if (kickRuntimeConfig.accessToken && hasOauthScope(kickRuntimeConfig.scopes, "channel:read")) {
    const tokenResult = await ensureKickTokenIsUsable();
    if (tokenResult.ok && kickRuntimeConfig.accessToken) {
      lookupToken = kickRuntimeConfig.accessToken;
    }
  }

  if (!lookupToken) {
    lookupToken = await getKickAppAccessToken();
  }

  const channels = await getKickChannels(lookupToken, { slug: normalized });
  const channel = channels[0];

  if (!channel?.broadcaster_user_id) {
    throw new Error("Kick broadcaster was not found.");
  }

  return {
    userId: String(channel.broadcaster_user_id),
    slug: channel.slug ?? (/^\d+$/.test(normalized) ? null : normalized),
    name: channel.slug ?? (/^\d+$/.test(normalized) ? normalized : null)
  };
}

function normalizeKickTargetKey(value: string | null | undefined) {
  return value ? normalizeKickBroadcasterInput(value).toLowerCase() : "";
}

function extractKickSubscriptionIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (current: unknown) => {
    if (!current || typeof current !== "object") {
      return;
    }

    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    const record = current as Record<string, unknown>;
    for (const key of ["id", "subscription_id", "event_subscription_id"]) {
      const id = record[key];
      if (typeof id === "string" || typeof id === "number") {
        ids.add(String(id));
      }
    }

    if (record.data) {
      visit(record.data);
    }
  };

  visit(value);
  return Array.from(ids);
}

function kickTargetFromRuntime() {
  if (!kickRuntimeConfig.broadcasterUserId) {
    return null;
  }

  return {
    userId: kickRuntimeConfig.broadcasterUserId,
    slug: kickRuntimeConfig.broadcasterSlug,
    name: kickRuntimeConfig.broadcasterName
  };
}

function upsertKickTrackedBroadcaster(
  target: { userId: string; slug: string | null; name: string | null },
  subscription: unknown
) {
  const now = new Date().toISOString();
  const subscriptionIds = extractKickSubscriptionIds(subscription);
  const existing = kickRuntimeConfig.trackedBroadcasters.find((tracked) => tracked.userId === target.userId);
  const nextSubscriptionIds = Array.from(new Set([...(existing?.subscriptionIds ?? []), ...subscriptionIds]));
  const nextTarget: KickTrackedBroadcaster = {
    userId: target.userId,
    slug: target.slug,
    name: target.name,
    subscriptionIds: nextSubscriptionIds,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now
  };

  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    trackedBroadcasters: [
      ...kickRuntimeConfig.trackedBroadcasters.filter((tracked) => tracked.userId !== target.userId),
      nextTarget
    ]
  };

  const session = currentStoredKickSession();
  if (session) {
    saveStoredKickSession(session);
  }

  sourceHub.upsert({
    id: sourceIdForPlatform("kick", nextTarget.userId, nextTarget.slug ?? nextTarget.name, "Kick"),
    platform: "kick",
    label: nextTarget.name ?? nextTarget.slug ?? nextTarget.userId,
    channelId: nextTarget.userId,
    channelName: nextTarget.slug ?? nextTarget.name,
    sourceUrl: nextTarget.slug ? `https://kick.com/${nextTarget.slug}` : null,
    status: "unknown"
  });

  return nextTarget;
}

function removeKickTrackedBroadcaster(target: string) {
  const normalizedTarget = normalizeKickTargetKey(target);
  const removed = kickRuntimeConfig.trackedBroadcasters.find((tracked) =>
    [tracked.userId, tracked.slug, tracked.name].some((value) => normalizeKickTargetKey(value) === normalizedTarget)
  );

  if (!removed) {
    return null;
  }

  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    trackedBroadcasters: kickRuntimeConfig.trackedBroadcasters.filter((tracked) => tracked.userId !== removed.userId)
  };
  sourceHub.remove(sourceIdForPlatform("kick", removed.userId, removed.slug ?? removed.name, "Kick"));

  const session = currentStoredKickSession();
  if (session) {
    saveStoredKickSession(session);
  }

  return removed;
}

function kickMessageMatchesTrackedBroadcaster(message: ChatMessage) {
  return kickRuntimeConfig.trackedBroadcasters.some((tracked) => {
    const trackedKeys = [tracked.userId, tracked.slug, tracked.name].map(normalizeKickTargetKey).filter(Boolean);
    const messageKeys = [message.channelId, message.channelName].map(normalizeKickTargetKey).filter(Boolean);
    return trackedKeys.some((trackedKey) => messageKeys.includes(trackedKey));
  });
}

async function subscribeKickWithRuntime(broadcasterUserId?: string | null) {
  const targetBroadcasterUserId = broadcasterUserId ?? (kickRuntimeConfig.tokenSource === "oauth" ? null : kickRuntimeConfig.broadcasterUserId);
  const useAppToken = Boolean(targetBroadcasterUserId);
  const accessToken = useAppToken ? await getKickAppAccessToken() : kickRuntimeConfig.accessToken;

  if (!useAppToken) {
    const tokenResult = await ensureKickTokenIsUsable();
    if (!tokenResult.ok || !kickRuntimeConfig.accessToken) {
      throw new Error("Kick OAuth access token is missing or expired.");
    }
  }

  if (!accessToken) {
    throw new Error("Kick access token is missing or expired.");
  }

  if (useAppToken && !targetBroadcasterUserId) {
    throw new Error("Set KICK_BROADCASTER_USER_ID before subscribing with an app access token.");
  }

  stopDemoMessages();
  const subscription = await subscribeKickChatWebhook({
    accessToken,
    broadcasterUserId: targetBroadcasterUserId,
    statuses
  });

  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    ingestionEnabled: true
  };

  const session = currentStoredKickSession();
  if (session) {
    saveStoredKickSession(session);
  }

  return subscription;
}

function stopDemoMessages() {
  if (process.env.DEMO_CHAT_FORCE === "true") {
    return;
  }

  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

function publicTwitchConfig() {
  return {
    enabled: isEnabled("TWITCH_EVENTSUB_ENABLED") || Boolean(twitchRuntimeConfig.userAccessToken),
    oauthSessionStored: fs.existsSync(twitchSessionPath),
    sessionPath: twitchSessionPath,
    credentialsPresent: twitchCredentialsPresent(),
    authorizedUserId: twitchRuntimeConfig.userId,
    authorizedLogin: twitchRuntimeConfig.userLogin,
    scopes: twitchRuntimeConfig.scopes,
    broadcasterUserId: twitchRuntimeConfig.broadcasterUserId,
    broadcasterLogin: twitchRuntimeConfig.broadcasterLogin,
    trackedBroadcasters: twitchRuntimeConfig.trackedBroadcasters
  };
}

function publicKickConfig() {
  return {
    ingress: "/api/webhooks/kick",
    webhookUrl: process.env.KICK_WEBHOOK_URL ?? null,
    autoSubscribeEnabled: isEnabled("KICK_AUTO_SUBSCRIBE"),
    oauthSessionStored: fs.existsSync(kickSessionPath),
    sessionPath: kickSessionPath,
    tokenSource: kickRuntimeConfig.tokenSource,
    ingestionEnabled: kickRuntimeConfig.ingestionEnabled,
    scopes: kickRuntimeConfig.scopes,
    expiresAt: kickRuntimeConfig.expiresAt,
    broadcasterUserId: kickRuntimeConfig.broadcasterUserId,
    broadcasterSlug: kickRuntimeConfig.broadcasterSlug,
    broadcasterName: kickRuntimeConfig.broadcasterName,
    trackedBroadcasters: kickRuntimeConfig.trackedBroadcasters,
    credentialsPresent: kickCredentialsPresent(),
    signatureVerification: Boolean(process.env.KICK_PUBLIC_KEY_PEM)
  };
}

function publicXConfig() {
  const activeTargets = Array.from(xLiveChatWorkers.entries()).map(([id, target]) => ({
    id,
    targetUrl: target.targetUrl,
    channelName: target.channelName,
    startedAt: target.startedAt
  }));

  return {
    mode: "filtered-stream-public-posts",
    autoStartEnabled: isEnabled("X_STREAM_ENABLED"),
    streamEnabled: Boolean(xWorker),
    configured: Boolean(xRuntimeConfig.bearerToken),
    liveChatCapture: {
      running: xLiveChatWorkers.size > 0,
      profilePath: xLiveChatProfilePath,
      debugPort: parsePositiveIntegerEnv("X_LIVE_CHAT_DEBUG_PORT", 9223),
      chromeFound: Boolean(findChromeExecutable(process.env.X_LIVE_CHAT_CHROME_PATH)),
      activeTargets
    },
    liveCapture: {
      endpoint: "/api/capture/x-live",
      scriptPath: "/x-live-capture.js",
      tokenRequired: Boolean(process.env.X_LIVE_CAPTURE_TOKEN),
      extensionOriginsAllowed: xLiveCaptureExtensionOriginsAllowed,
      allowedOrigins: [...xLiveCaptureAllowedOrigins]
    },
    rawRules: xRuntimeConfig.rawRules,
    rules: xRuntimeConfig.rules
  };
}

function publicDashboardConfig(req?: Request) {
  const host = req?.get("host") ?? `localhost:${port}`;
  const protocol = req?.protocol ?? "http";
  return buildPublicDashboardConfig({
    session: liveSessionStore.get(),
    sources: sourceHub.snapshot(),
    parentHost: host,
    protocol
  });
}

async function refreshTwitchViewerSources() {
  for (const tracked of twitchRuntimeConfig.trackedBroadcasters) {
    sourceHub.upsert({
      id: sourceIdForPlatform("twitch", tracked.userId, tracked.login ?? tracked.displayName, "Twitch"),
      platform: "twitch",
      label: tracked.displayName ?? tracked.login ?? tracked.userId,
      channelId: tracked.userId,
      channelName: tracked.login ?? tracked.displayName,
      sourceUrl: tracked.login ? `https://www.twitch.tv/${tracked.login}` : null,
      status: "unknown"
    });
  }

  if (!twitchRuntimeConfig.clientId || !twitchRuntimeConfig.userAccessToken || twitchRuntimeConfig.trackedBroadcasters.length === 0) {
    return;
  }

  const tokenResult = await ensureTwitchTokenIsUsable();
  if (!tokenResult.ok || !twitchRuntimeConfig.userAccessToken) {
    return;
  }

  const query = new URLSearchParams();
  for (const tracked of twitchRuntimeConfig.trackedBroadcasters) {
    query.append("user_id", tracked.userId);
  }

  const response = await fetch(`https://api.twitch.tv/helix/streams?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${twitchRuntimeConfig.userAccessToken}`,
      "Client-Id": twitchRuntimeConfig.clientId
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch viewer lookup failed with ${response.status}: ${body}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      user_id: string;
      user_login: string;
      user_name: string;
      title?: string;
      type?: string;
      viewer_count?: number;
    }>;
  };
  const streamsByUserId = new Map((body.data ?? []).map((stream) => [stream.user_id, stream]));

  for (const tracked of twitchRuntimeConfig.trackedBroadcasters) {
    const stream = streamsByUserId.get(tracked.userId);
    const label = stream?.user_name ?? tracked.displayName ?? tracked.login ?? tracked.userId;
    const login = stream?.user_login ?? tracked.login;
    sourceHub.upsert({
      id: sourceIdForPlatform("twitch", tracked.userId, login ?? label, label),
      platform: "twitch",
      label,
      channelId: tracked.userId,
      channelName: login ?? label,
      sourceUrl: login ? `https://www.twitch.tv/${login}` : null,
      viewerCount: stream?.viewer_count ?? 0,
      status: stream?.type === "live" ? "live" : "offline",
      detail: stream?.title ?? null
    });
  }
}

async function refreshKickViewerSources() {
  for (const tracked of kickRuntimeConfig.trackedBroadcasters) {
    sourceHub.upsert({
      id: sourceIdForPlatform("kick", tracked.userId, tracked.slug ?? tracked.name, "Kick"),
      platform: "kick",
      label: tracked.name ?? tracked.slug ?? tracked.userId,
      channelId: tracked.userId,
      channelName: tracked.slug ?? tracked.name,
      sourceUrl: tracked.slug ? `https://kick.com/${tracked.slug}` : null,
      status: "unknown"
    });
  }

  if (kickRuntimeConfig.trackedBroadcasters.length === 0) {
    return;
  }

  let accessToken: string | null = null;
  if (kickRuntimeConfig.accessToken) {
    const tokenResult = await ensureKickTokenIsUsable();
    if (tokenResult.ok) {
      accessToken = kickRuntimeConfig.accessToken;
    }
  }
  accessToken = accessToken ?? (await getKickAppAccessToken());
  const query = new URLSearchParams();
  for (const tracked of kickRuntimeConfig.trackedBroadcasters) {
    query.append("broadcaster_user_id", tracked.userId);
  }

  const response = await fetch(`https://api.kick.com/public/v1/livestreams?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kick viewer lookup failed with ${response.status}: ${body}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      broadcaster_user_id?: number | string;
      slug?: string;
      stream_title?: string;
      viewer_count?: number;
    }>;
  };
  const streamsByUserId = new Map((body.data ?? []).map((stream) => [String(stream.broadcaster_user_id), stream]));

  for (const tracked of kickRuntimeConfig.trackedBroadcasters) {
    const stream = streamsByUserId.get(tracked.userId);
    const slug = stream?.slug ?? tracked.slug;
    const label = tracked.name ?? slug ?? tracked.userId;
    sourceHub.upsert({
      id: sourceIdForPlatform("kick", tracked.userId, slug ?? label, label),
      platform: "kick",
      label,
      channelId: tracked.userId,
      channelName: slug ?? label,
      sourceUrl: slug ? `https://kick.com/${slug}` : null,
      viewerCount: stream?.viewer_count ?? 0,
      status: stream ? "live" : "offline",
      detail: stream?.stream_title ?? null
    });
  }
}

async function refreshViewerSources() {
  updateMarketBubbleViewerSource();
  const results = await Promise.allSettled([refreshTwitchViewerSources(), refreshKickViewerSources()]);
  const [twitchResult, kickResult] = results;

  if (twitchResult.status === "rejected") {
    statuses.set("twitch", "error", `Twitch viewer count refresh failed: ${String(twitchResult.reason)}`);
  }

  if (kickResult.status === "rejected") {
    statuses.set("kick", "error", `Kick viewer count refresh failed: ${String(kickResult.reason)}`);
  }
}

function startOrRestartXWorker() {
  if (!xRuntimeConfig.bearerToken) {
    statuses.set("x", "error", "X stream restart requested but X_BEARER_TOKEN is missing.");
    return false;
  }

  stopDemoMessages();
  xWorker?.stop();
  xWorker = new XFilteredStreamWorker({
    bearerToken: xRuntimeConfig.bearerToken,
    rules: xRuntimeConfig.rules,
    publish,
    statuses
  });
  xWorker.start();
  return true;
}

function stopXWorker() {
  xWorker?.stop();
  xWorker = null;
  statuses.set("x", "disabled", "X Filtered Stream worker stopped.");
}

function stopXLiveChatWorker() {
  for (const [id, target] of xLiveChatWorkers.entries()) {
    target.worker.stop();
    sourceHub.remove(id);
  }
  xLiveChatWorkers.clear();
}

function stopXLiveChatTarget(targetId: string) {
  const target = xLiveChatWorkers.get(targetId);
  if (!target) {
    return null;
  }

  target.worker.stop();
  xLiveChatWorkers.delete(targetId);
  return target;
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    configuration: {
      envFileLoaded: !envLoadResult.error,
      envFilePath,
      liveSessionPath,
      realIngestionEnabled,
      demoForced: process.env.DEMO_CHAT_FORCE === "true"
    },
    demoEnabled,
    messageCount: hub.size,
    messageHistoryLimit,
    liveSession: liveSessionStore.get(),
    sources: sourceHub.snapshot(),
    publicDashboard: publicDashboardConfig(req),
    integrations: {
      statuses: statuses.snapshot(),
      twitch: {
        ingress: "/api/webhooks/twitch/eventsub",
        websocketEnabled: isEnabled("TWITCH_EVENTSUB_ENABLED") || Boolean(twitchRuntimeConfig.userAccessToken),
        ...publicTwitchConfig(),
        signatureVerification: Boolean(process.env.TWITCH_EVENTSUB_SECRET)
      },
      kick: publicKickConfig(),
      x: publicXConfig()
    }
  });
});

app.get("/api/sources", (_req, res) => {
  res.json(sourceHub.snapshot());
});

app.get("/api/public/config", (req, res) => {
  res.json({
    dashboard: publicDashboardConfig(req),
    sources: sourceHub.snapshot()
  });
});

app.get("/api/live-session", (req, res) => {
  res.json({
    liveSession: liveSessionStore.get(),
    dashboard: publicDashboardConfig(req),
    sources: sourceHub.snapshot()
  });
});

app.put("/api/live-session", (req, res) => {
  const parsed = liveSessionUpdateSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, "Invalid live session settings.");
  }

  const session = liveSessionStore.update(parsed.data);
  updateMarketBubbleViewerSource();
  res.json({
    liveSession: session,
    dashboard: publicDashboardConfig(req),
    sources: sourceHub.snapshot()
  });
});

app.get("/api/messages", (_req, res) => {
  res.json({ messages: hub.snapshot() });
});

app.post("/api/messages", (req, res) => {
  const parsed = chatMessageSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(res, 400, "Invalid normalized chat message.");
  }

  const added = publish(parsed.data);
  res.status(added ? 201 : 200).json({ added, message: parsed.data });
});

app.post("/api/mock/messages", (req, res) => {
  const parsed = mockMessageSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(res, 400, "Invalid mock message.");
  }

  const now = new Date().toISOString();
  const platformMessageId = `mock-${Date.now()}`;
  const message = chatMessageSchema.parse({
    id: makeMessageId(parsed.data.platform, platformMessageId),
    platform: parsed.data.platform,
    sourceKind: parsed.data.platform === "x" ? "public_post" : "chat",
    platformMessageId,
    platformUserId: "local-dev-user",
    username: parsed.data.username,
    displayName: parsed.data.username,
    channelId: "local-dev-channel",
    channelName: parsed.data.channelName ?? "Local Development",
    sourceId: `local-dev:${parsed.data.platform}`,
    sourceLabel: "Local Development",
    sourceUrl: null,
    message: parsed.data.message,
    fragments: [textFragment(parsed.data.message)],
    badges: [],
    avatarUrl: null,
    color: parsed.data.platform === "kick" ? "#53fc18" : parsed.data.platform === "twitch" ? "#a78bfa" : null,
    sentAt: now,
    receivedAt: now
  });

  publish(message);
  res.status(201).json({ added: true, message });
});

app.post("/api/native-chat/messages", (req, res) => {
  const parsed = nativeChatInputSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, "Invalid native chat message.");
  }

  if (!canPostNativeChat(nativeChatClientId(req, parsed.data.clientId))) {
    return sendError(res, 429, "Native chat rate limit exceeded.");
  }

  const liveSession = liveSessionStore.get();
  const message = createNativeChatMessage(parsed.data, {
    nativeChatLabel: liveSession.nativeChatLabel,
    streamWatchUrl: liveSession.streamWatchUrl
  });
  const added = publish(message);
  res.status(added ? 201 : 200).json({ added, message });
});

app.post("/api/webhooks/twitch/eventsub", (req: RawBodyRequest, res: Response) => {
  const verification = verifyTwitchSignature(req);

  if (!verification.ok) {
    return sendError(res, 403, "Invalid Twitch EventSub signature.");
  }

  const messageType = req.header("Twitch-Eventsub-Message-Type");
  if (messageType === "webhook_callback_verification" && typeof req.body.challenge === "string") {
    return res.status(200).send(req.body.challenge);
  }

  if (messageType === "revocation") {
    return res.status(202).json({ accepted: true, revoked: true });
  }

  const message = normalizeTwitchChatMessage(req.body);
  if (!message) {
    return res.status(202).json({ accepted: true, ignored: true, reason: "twitch_message_not_normalized" });
  }

  if (!twitchMessageMatchesTrackedBroadcaster(message)) {
    return res.status(202).json({
      accepted: true,
      ignored: true,
      reason: "twitch_broadcaster_not_tracked",
      channelId: message.channelId,
      channelName: message.channelName
    });
  }

  const added = publish(message);
  res.status(added ? 202 : 200).json({ accepted: true, added });
});

app.post("/api/webhooks/kick", (req: RawBodyRequest, res: Response) => {
  const verification = verifyKickSignature(req);

  if (!verification.ok) {
    return sendError(res, 403, "Invalid Kick webhook signature.");
  }

  const eventType = req.header("Kick-Event-Type");
  if (eventType && eventType !== "chat.message.sent") {
    return res.status(202).json({ accepted: true, ignored: true });
  }

  if (!kickRuntimeConfig.ingestionEnabled) {
    return res.status(202).json({ accepted: true, ignored: true, reason: "kick_ingestion_paused" });
  }

  const message = normalizeKickChatMessage(req.body);
  if (!kickMessageMatchesTrackedBroadcaster(message)) {
    return res.status(202).json({
      accepted: true,
      ignored: true,
      reason: "kick_broadcaster_not_tracked",
      channelId: message.channelId,
      channelName: message.channelName
    });
  }

  const added = publish(message);
  res.status(added ? 202 : 200).json({ accepted: true, added });
});

app.options("/api/capture/x-live", (req, res) => {
  applyXLiveCaptureCors(req, res);
  if (!xLiveCaptureOriginAllowed(req)) {
    return sendError(res, 403, "X live capture origin is not allowed.");
  }
  res.status(204).send();
});

app.post("/api/capture/x-live", (req, res) => {
  applyXLiveCaptureCors(req, res);

  if (!xLiveCaptureOriginAllowed(req)) {
    return sendError(res, 403, "X live capture origin is not allowed.");
  }

  const parsed = xLiveCaptureBatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, "Invalid X live capture payload.");
  }

  const captureBody = parsed.data as XLiveCapturePayload | XLiveCaptureBatchPayload;
  const isBatchCapture = Array.isArray((captureBody as { messages?: unknown }).messages);

  if (isBatchCapture && !xLiveCaptureTokenValid(req, (captureBody as XLiveCaptureBatchPayload).token)) {
    return sendError(res, 401, "Invalid X live capture token.");
  }

  if (!isBatchCapture && !xLiveCaptureTokenValid(req, null)) {
    return sendError(res, 401, "Invalid X live capture token.");
  }

  const batch = isBatchCapture ? (captureBody as XLiveCaptureBatchPayload) : null;
  const defaults = batch ? { channelName: batch.channelName } : {};
  const payloads = batch
    ? batch.messages.map((message) => ({
        ...message,
        sourceUrl: message.sourceUrl ?? batch.sourceUrl,
        channelName: message.channelName ?? batch.channelName
      }))
    : [captureBody as XLiveCapturePayload];
  let added = 0;

  for (const payload of payloads) {
    if (publish(normalizeXLiveCaptureMessage(payload, defaults))) {
      added += 1;
    }
  }

  statuses.set("x", "connected", `X live browser capture received ${added} new message(s).`);
  res.status(202).json({ accepted: true, added, received: payloads.length });
});

app.get("/api/integrations/kick/config", (_req, res) => {
  res.json(publicKickConfig());
});

app.post("/api/integrations/kick/subscribe-chat", async (req, res) => {
  const parsed = kickSubscribeSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, "Invalid Kick subscription request.");
  }

  try {
    const broadcasterInput = parsed.data.broadcaster ?? parsed.data.broadcasterSlug ?? parsed.data.broadcasterUserId;
    const resolvedBroadcaster = await resolveKickBroadcaster(broadcasterInput);

    if (resolvedBroadcaster) {
      kickRuntimeConfig = {
        ...kickRuntimeConfig,
        broadcasterUserId: resolvedBroadcaster.userId,
        broadcasterSlug: resolvedBroadcaster.slug,
        broadcasterName: resolvedBroadcaster.name
      };
    }

    const subscription = await subscribeKickWithRuntime(resolvedBroadcaster?.userId ?? parsed.data.broadcasterUserId);
    const trackedBroadcaster = resolvedBroadcaster ?? kickTargetFromRuntime();
    if (trackedBroadcaster) {
      upsertKickTrackedBroadcaster(trackedBroadcaster, subscription);
    }

    res.status(201).json({ subscription, kick: publicKickConfig() });
  } catch (error) {
    statuses.set("kick", "error", String(error));
    sendError(res, 502, "Kick chat subscription failed.");
  }
});

app.post("/api/integrations/kick/restart", async (_req, res) => {
  try {
    const subscriptions = [];
    if (kickRuntimeConfig.trackedBroadcasters.length > 0) {
      for (const tracked of kickRuntimeConfig.trackedBroadcasters) {
        const subscription = await subscribeKickWithRuntime(tracked.userId);
        upsertKickTrackedBroadcaster(tracked, subscription);
        subscriptions.push(subscription);
      }
    } else {
      const subscription = await subscribeKickWithRuntime();
      const trackedBroadcaster = kickTargetFromRuntime();
      if (trackedBroadcaster) {
        upsertKickTrackedBroadcaster(trackedBroadcaster, subscription);
      }
      subscriptions.push(subscription);
    }
    res.status(202).json({ subscriptions, kick: publicKickConfig() });
  } catch (error) {
    statuses.set("kick", "error", String(error));
    sendError(res, 502, "Kick resubscribe failed.");
  }
});

app.delete("/api/integrations/kick/targets/:target", (req, res) => {
  const parsed = kickTargetSchema.safeParse({ target: req.params.target });

  if (!parsed.success) {
    return sendError(res, 400, "Invalid Kick target.");
  }

  const removed = removeKickTrackedBroadcaster(parsed.data.target);
  if (!removed) {
    return sendError(res, 404, "Kick target was not tracked.");
  }

  statuses.set("kick", "connected", `Removed ${removed.slug ?? removed.name ?? removed.userId} from the local Kick target list.`);
  res.json({ removed, kick: publicKickConfig() });
});

app.post("/api/integrations/kick/disconnect", (_req, res) => {
  deleteStoredKickSession();
  kickRuntimeConfig = {
    ...kickRuntimeConfig,
    accessToken: process.env.KICK_ACCESS_TOKEN ?? null,
    refreshToken: null,
    scopes: [],
    expiresAt: null,
    broadcasterUserId: process.env.KICK_BROADCASTER_USER_ID ?? null,
    broadcasterSlug: null,
    broadcasterName: null,
    trackedBroadcasters: process.env.KICK_BROADCASTER_USER_ID
      ? [
          {
            userId: process.env.KICK_BROADCASTER_USER_ID,
            slug: null,
            name: process.env.KICK_BROADCASTER_USER_ID,
            subscriptionIds: [],
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      : [],
    tokenSource: process.env.KICK_ACCESS_TOKEN ? "env" : null,
    ingestionEnabled: false
  };
  statuses.set(
    "kick",
    "disabled",
    "Kick disconnected locally. Existing remote Kick webhook subscriptions may still send events, but this app is ignoring them."
  );
  res.json({ kick: publicKickConfig() });
});

app.get("/api/auth/kick/start", (req, res) => {
  if (!kickRuntimeConfig.clientId) {
    return sendError(res, 400, "Set KICK_CLIENT_ID before starting Kick OAuth.");
  }

  const redirectUri = process.env.KICK_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/api/auth/kick/callback`;
  const scopes = process.env.KICK_OAUTH_SCOPES ?? "events:subscribe channel:read";
  const state = crypto.randomBytes(18).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  kickOAuthStates.set(state, { createdAt: Date.now(), codeVerifier });

  const authorizeUrl = new URL("https://id.kick.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", kickRuntimeConfig.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", scopes);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", createPkceChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  res.redirect(authorizeUrl.toString());
});

app.get("/api/auth/kick/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const savedState = kickOAuthStates.get(state);

  if (!code || !savedState) {
    return sendError(res, 400, "Invalid Kick OAuth callback.");
  }

  kickOAuthStates.delete(state);
  if (Date.now() - savedState.createdAt > 10 * 60 * 1000) {
    return sendError(res, 400, "Kick OAuth state expired.");
  }

  if (!kickRuntimeConfig.clientId || !kickRuntimeConfig.clientSecret) {
    return sendError(res, 400, "Set KICK_CLIENT_ID and KICK_CLIENT_SECRET before completing Kick OAuth.");
  }

  const redirectUri = process.env.KICK_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/api/auth/kick/callback`;

  try {
    const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: kickRuntimeConfig.clientId,
        client_secret: kickRuntimeConfig.clientSecret,
        code,
        code_verifier: savedState.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Kick token exchange failed with ${tokenResponse.status}: ${body}`);
    }

    const token = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string[] | string;
    };
    const scopes = normalizeOauthScopes(token.scope);
    let broadcasterUserId: string | null = null;
    let broadcasterSlug: string | null = null;
    let channelLookupError: string | null = null;

    kickRuntimeConfig = {
      ...kickRuntimeConfig,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      scopes,
      expiresAt: expiresAtFromExpiresIn(token.expires_in),
      broadcasterUserId,
      broadcasterSlug,
      broadcasterName: broadcasterSlug,
      tokenSource: "oauth"
    };

    if (hasOauthScope(scopes, "channel:read")) {
      try {
        const channel = await getKickAuthenticatedChannel(token.access_token);
        broadcasterUserId = channel?.broadcaster_user_id?.toString() ?? null;
        broadcasterSlug = channel?.slug ?? null;
        kickRuntimeConfig = {
          ...kickRuntimeConfig,
          broadcasterUserId,
          broadcasterSlug,
          broadcasterName: broadcasterSlug
        };
      } catch (error) {
        channelLookupError = String(error);
        statuses.set("kick", "connected", `Kick OAuth connected, but channel lookup failed: ${channelLookupError}`);
      }
    } else {
      channelLookupError = "Kick did not grant channel:read, so channel lookup was skipped.";
      statuses.set("kick", "connected", channelLookupError);
    }

    const session = currentStoredKickSession();
    if (session) {
      saveStoredKickSession(session);
    }

    let subscriptionError: string | null = null;
    try {
      const subscription = await subscribeKickWithRuntime();
      const trackedBroadcaster = kickTargetFromRuntime();
      if (trackedBroadcaster) {
        upsertKickTrackedBroadcaster(trackedBroadcaster, subscription);
      }
    } catch (error) {
      subscriptionError = String(error);
      statuses.set("kick", "error", `Kick OAuth connected, but webhook subscription failed: ${subscriptionError}`);
    }

    const channelLabel = broadcasterSlug ?? broadcasterUserId ?? "Kick channel";
    const safeStatus = subscriptionError
      ? "Kick OAuth is connected, but the webhook subscription needs attention in Source Settings."
      : channelLookupError
        ? "Kick OAuth is connected and the webhook subscription was requested. Channel lookup was unavailable."
        : `Authenticated ${channelLabel}. Returning to LS Chat...`;
    res.type("html").send(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><meta http-equiv="refresh" content="1;url=/"><title>Kick connected</title></head>
        <body style="font-family: system-ui; background: #0f1014; color: #f1f2f4;">
          <main style="padding: 24px;">
            <h1>Kick connected</h1>
            <p>${escapeHtml(safeStatus)}</p>
            <p><a style="color: #53fc18;" href="/">Open chat</a></p>
          </main>
        </body>
      </html>`);
  } catch (error) {
    statuses.set("kick", "error", String(error));
    sendError(res, 502, "Kick OAuth failed.");
  }
});

app.get("/api/integrations/x/config", (_req, res) => {
  res.json(publicXConfig());
});

app.post("/api/integrations/x/rules", (req, res) => {
  const parsed = xRulesSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, "Invalid X rules payload.");
  }

  xRuntimeConfig = {
    ...xRuntimeConfig,
    rawRules: parsed.data.rules,
    rules: parseXRules(parsed.data.rules)
  };

  if (xWorker) {
    startOrRestartXWorker();
  } else {
    statuses.set(
      "x",
      "disabled",
      `X rules saved (${xRuntimeConfig.rules.length}). Use Restart to connect the Filtered Stream worker.`
    );
  }

  res.json({ x: publicXConfig() });
});

app.post("/api/integrations/x/restart", (_req, res) => {
  const started = startOrRestartXWorker();
  res.status(started ? 202 : 400).json({ started, x: publicXConfig() });
});

app.post("/api/integrations/x/stop", (_req, res) => {
  stopXWorker();
  res.json({ x: publicXConfig() });
});

app.post("/api/integrations/x/livechat/start", async (req, res) => {
  const parsed = xLiveChatStartSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, "Provide an X username or livechat URL.");
  }

  const input = parsed.data.url ?? parsed.data.username ?? "";
  const chromePath = findChromeExecutable(process.env.X_LIVE_CHAT_CHROME_PATH);
  if (!chromePath) {
    return sendError(res, 400, "Chrome or Edge was not found. Set X_LIVE_CHAT_CHROME_PATH to the browser executable.");
  }

  let targetId: string | null = null;
  try {
    const targetUrl = xLiveChatUrlFromInput(input);
    const channelName = parsed.data.channelName ?? xLiveChatChannelFromInput(input);
    targetId = `x:${sourceKey(targetUrl)}`;
    stopXLiveChatTarget(targetId);
    stopDemoMessages();
    const worker = new XLiveChatCaptureWorker({
      targetUrl,
      channelName,
      chromePath,
      userDataDir: xLiveChatProfilePath,
      debugPort: parsePositiveIntegerEnv("X_LIVE_CHAT_DEBUG_PORT", 9223),
      scanMs: parsePositiveIntegerEnv("X_LIVE_CHAT_SCAN_MS", 1200),
      publish,
      statuses
    });
    xLiveChatWorkers.set(targetId, {
      worker,
      targetUrl,
      channelName,
      startedAt: new Date().toISOString()
    });
    await worker.start();
    sourceHub.upsert({
      id: targetId,
      platform: "x",
      label: channelName,
      channelId: targetUrl,
      channelName,
      sourceUrl: targetUrl,
      status: "connected",
      detail: "X livechat capture"
    });
    res.status(202).json({ started: true, targetId, targetUrl, x: publicXConfig() });
  } catch (error) {
    if (targetId) {
      stopXLiveChatTarget(targetId);
    }
    statuses.set("x", "error", `X livechat capture failed: ${String(error)}`);
    sendError(res, 502, "X livechat capture failed.");
  }
});

app.post("/api/integrations/x/livechat/stop", (_req, res) => {
  stopXLiveChatWorker();
  res.json({ x: publicXConfig() });
});

app.delete("/api/integrations/x/livechat/targets/:targetId", (req, res) => {
  const removed = stopXLiveChatTarget(req.params.targetId);
  if (!removed) {
    return sendError(res, 404, "X livechat target was not running.");
  }

  sourceHub.remove(req.params.targetId);
  statuses.set("x", xLiveChatWorkers.size > 0 ? "connected" : "disabled", `Stopped X livechat capture for ${removed.channelName}.`);
  res.json({ removed: { targetUrl: removed.targetUrl, channelName: removed.channelName }, x: publicXConfig() });
});

app.get("/api/integrations/twitch/config", (_req, res) => {
  res.json(publicTwitchConfig());
});

app.get("/api/integrations/twitch/users", async (req, res) => {
  const login = typeof req.query.login === "string" ? req.query.login.trim() : "";
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";

  if (!login && !id) {
    return sendError(res, 400, "Provide a Twitch login or id.");
  }

  try {
    const users = await getTwitchUsers({ login: login || undefined, id: id || undefined });
    res.json({ users });
  } catch (error) {
    statuses.set("twitch", "error", String(error));
    sendError(res, 502, "Twitch user lookup failed.");
  }
});

app.post("/api/integrations/twitch/broadcaster", async (req, res) => {
  const parsed = twitchBroadcasterSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    return sendError(res, 400, "Provide a Twitch broadcaster login or user ID.");
  }

  try {
    let broadcaster = {
      id: parsed.data.userId ?? "",
      login: parsed.data.login ?? ""
    };

    if (parsed.data.login || parsed.data.userId) {
      const users = await getTwitchUsers({ login: parsed.data.login, id: parsed.data.userId });
      if (users.length === 0) {
        return sendError(res, 404, "Twitch broadcaster was not found.");
      }
      broadcaster = {
        id: users[0].id,
        login: users[0].login
      };
    }

    twitchRuntimeConfig = {
      ...twitchRuntimeConfig,
      broadcasterUserId: broadcaster.id,
      broadcasterLogin: broadcaster.login
    };
    upsertTwitchTrackedBroadcaster({
      id: broadcaster.id,
      login: broadcaster.login,
      displayName: broadcaster.login
    });
    const session = currentStoredTwitchSession();
    if (session) {
      saveStoredTwitchSession(session);
    }
    const started = await startOrRestartTwitchWorker();
    res.json({ twitch: publicTwitchConfig(), started });
  } catch (error) {
    statuses.set("twitch", "error", String(error));
    sendError(res, 502, "Unable to switch Twitch broadcaster.");
  }
});

app.post("/api/integrations/twitch/restart", async (_req, res) => {
  const started = await startOrRestartTwitchWorker();
  res.status(started ? 202 : 400).json({ started, twitch: publicTwitchConfig() });
});

app.delete("/api/integrations/twitch/targets/:target", async (req, res) => {
  const parsed = integrationTargetSchema.safeParse({ target: req.params.target });

  if (!parsed.success) {
    return sendError(res, 400, "Invalid Twitch target.");
  }

  const removed = removeTwitchTrackedBroadcaster(parsed.data.target);
  if (!removed) {
    return sendError(res, 404, "Twitch target was not tracked.");
  }

  if (twitchRuntimeConfig.trackedBroadcasters.length > 0) {
    await startOrRestartTwitchWorker();
  } else {
    twitchWorker?.stop();
    twitchWorker = null;
    statuses.set("twitch", "connected", `Removed ${removed.login ?? removed.displayName ?? removed.userId}; no Twitch broadcasters are tracked.`);
  }

  res.json({ removed, twitch: publicTwitchConfig() });
});

app.post("/api/integrations/twitch/disconnect", (_req, res) => {
  twitchWorker?.stop();
  twitchWorker = null;
  deleteStoredTwitchSession();
  twitchRuntimeConfig = {
    ...twitchRuntimeConfig,
    userAccessToken: process.env.TWITCH_USER_ACCESS_TOKEN ?? null,
    refreshToken: null,
    scopes: [],
    userId: process.env.TWITCH_USER_ID ?? null,
    userLogin: null,
    broadcasterUserId: process.env.TWITCH_BROADCASTER_USER_ID ?? null,
    broadcasterLogin: null,
    trackedBroadcasters: process.env.TWITCH_BROADCASTER_USER_ID
      ? [
          {
            userId: process.env.TWITCH_BROADCASTER_USER_ID,
            login: null,
            displayName: null,
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      : []
  };
  statuses.set("twitch", "disabled", "Twitch OAuth session disconnected.");
  res.json({ twitch: publicTwitchConfig() });
});

app.get("/api/auth/twitch/start", (req, res) => {
  if (!twitchRuntimeConfig.clientId) {
    return sendError(res, 400, "Set TWITCH_CLIENT_ID before starting Twitch OAuth.");
  }

  const redirectUri =
    process.env.TWITCH_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/api/auth/twitch/callback`;
  const scopes = process.env.TWITCH_OAUTH_SCOPES ?? "user:read:chat";
  const state = crypto.randomBytes(18).toString("hex");
  twitchOAuthStates.set(state, { createdAt: Date.now() });

  const authorizeUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", twitchRuntimeConfig.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", scopes);
  authorizeUrl.searchParams.set("state", state);

  res.redirect(authorizeUrl.toString());
});

app.get("/api/auth/twitch/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const savedState = twitchOAuthStates.get(state);

  if (!code || !savedState) {
    return sendError(res, 400, "Invalid Twitch OAuth callback.");
  }

  twitchOAuthStates.delete(state);
  if (Date.now() - savedState.createdAt > 10 * 60 * 1000) {
    return sendError(res, 400, "Twitch OAuth state expired.");
  }

  if (!twitchRuntimeConfig.clientId || !twitchRuntimeConfig.clientSecret) {
    return sendError(res, 400, "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET before completing Twitch OAuth.");
  }

  const redirectUri =
    process.env.TWITCH_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/api/auth/twitch/callback`;

  try {
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: twitchRuntimeConfig.clientId,
        client_secret: twitchRuntimeConfig.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Twitch token exchange failed with ${tokenResponse.status}: ${body}`);
    }

    const token = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string[];
    };
    const validateResponse = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    if (!validateResponse.ok) {
      const body = await validateResponse.text();
      throw new Error(`Twitch token validation failed with ${validateResponse.status}: ${body}`);
    }

    const validation = (await validateResponse.json()) as {
      login: string;
      user_id: string;
      scopes?: string[];
    };

    twitchRuntimeConfig = {
      ...twitchRuntimeConfig,
      userAccessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      scopes: token.scope ?? [],
      userId: validation.user_id,
      userLogin: validation.login,
      broadcasterUserId: validation.user_id,
      broadcasterLogin: validation.login
    };
    upsertTwitchTrackedBroadcaster({
      id: validation.user_id,
      login: validation.login,
      displayName: validation.login
    });

    const session = currentStoredTwitchSession({
      login: validation.login,
      user_id: validation.user_id,
      scopes: validation.scopes ?? token.scope,
      expires_in: token.expires_in
    });
    if (session) {
      saveStoredTwitchSession(session);
    }

    await startOrRestartTwitchWorker();
    const safeLogin = escapeHtml(validation.login);
    res.type("html").send(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><meta http-equiv="refresh" content="1;url=/"><title>Twitch connected</title></head>
        <body style="font-family: system-ui; background: #0f1014; color: #f1f2f4;">
          <main style="padding: 24px;">
            <h1>Twitch connected</h1>
            <p>Authenticated as ${safeLogin}. Returning to LS Chat...</p>
            <p><a style="color: #a970ff;" href="/">Open chat</a></p>
          </main>
        </body>
      </html>`);
  } catch (error) {
    statuses.set("twitch", "error", String(error));
    sendError(res, 502, "Twitch OAuth failed.");
  }
});

app.post("/api/mock/x-filtered-stream", (req, res) => {
  const message = normalizeXFilteredStreamPost(req.body);
  const added = publish(message);
  res.status(added ? 201 : 200).json({ added, message });
});

wss.on("connection", (socket, request) => {
  const socketUrl = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "localhost"}`);
  const isPublicViewer = socketUrl.searchParams.get("surface") === "viewer";
  if (isPublicViewer) {
    publicViewerSockets.add(socket);
    updateMarketBubbleViewerSource();
  }

  socket.send(JSON.stringify({ type: "status", status: "connected" }));
  socket.send(JSON.stringify({ type: "snapshot", messages: hub.snapshot(), maxMessages: messageHistoryLimit }));
  socket.send(JSON.stringify({ type: "sources", snapshot: sourceHub.snapshot() }));

  const unsubscribe = hub.subscribe((message) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "message", message }));
    }
  });

  const unsubscribeSources = sourceHub.subscribe((snapshot) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "sources", snapshot }));
    }
  });

  socket.on("close", () => {
    unsubscribe();
    unsubscribeSources();
    if (isPublicViewer) {
      publicViewerSockets.delete(socket);
      updateMarketBubbleViewerSource();
    }
  });
});

if (demoEnabled) {
  for (let i = 0; i < 5; i += 1) {
    publish(createDemoMessage());
  }

  demoInterval = setInterval(() => {
    publish(createDemoMessage());
  }, 6000);
  demoInterval.unref?.();
}

const workers: Array<{ stop: () => void }> = [];

function loadTwitchRuntimeFromStorage() {
  const storedSession = readStoredTwitchSession();
  if (!storedSession) {
    return false;
  }

  applyStoredTwitchSession(storedSession);
  statuses.set("twitch", "connecting", "Loaded stored Twitch OAuth session.");
  return true;
}

function loadKickRuntimeFromStorage() {
  const storedSession = readStoredKickSession();
  if (!storedSession) {
    return false;
  }

  applyStoredKickSession(storedSession);
  statuses.set("kick", "connected", "Loaded stored Kick OAuth session. Use Subscribe to refresh the webhook subscription.");
  return true;
}

async function startRealIngestionWorkers() {
  const storedTwitchLoaded = loadTwitchRuntimeFromStorage();
  const storedKickLoaded = loadKickRuntimeFromStorage();

  if (isEnabled("TWITCH_EVENTSUB_ENABLED") || storedTwitchLoaded) {
    await startOrRestartTwitchWorker();
  }

  if (isEnabled("X_STREAM_ENABLED")) {
    startOrRestartXWorker();
  }

  if (isEnabled("KICK_AUTO_SUBSCRIBE")) {
    const kickAutoSubscribe = async () => {
      if (kickRuntimeConfig.trackedBroadcasters.length > 0) {
        for (const tracked of kickRuntimeConfig.trackedBroadcasters) {
          const subscription = await subscribeKickWithRuntime(tracked.userId);
          upsertKickTrackedBroadcaster(tracked, subscription);
        }
        return;
      }

      const subscription = await subscribeKickWithRuntime();
      const trackedBroadcaster = kickTargetFromRuntime();
      if (trackedBroadcaster) {
        upsertKickTrackedBroadcaster(trackedBroadcaster, subscription);
      }
    };

    kickAutoSubscribe().catch((error) => {
      statuses.set(
        "kick",
        "error",
        `${storedKickLoaded ? "Stored Kick OAuth" : "Kick auto-subscribe"} failed: ${String(error)}`
      );
    });
  }
}

await startRealIngestionWorkers();

refreshViewerSources().catch((error) => {
  console.warn(`Viewer refresh will retry: ${String(error)}`);
});

const viewerRefreshTimer = setInterval(() => {
  refreshViewerSources().catch((error) => {
    console.warn(`Viewer refresh will retry: ${String(error)}`);
  });
}, viewerPollMs);
viewerRefreshTimer.unref?.();

const twitchValidationTimer = setInterval(() => {
  if (!twitchRuntimeConfig.userAccessToken) {
    return;
  }

  ensureTwitchTokenIsUsable()
    .then((result) => {
      if (result.refreshed) {
        return startOrRestartTwitchWorker();
      }
      return undefined;
    })
    .catch((error) => {
      statuses.set("twitch", "error", `Twitch token validation failed: ${String(error)}`);
    });
}, 60 * 60 * 1000);
twitchValidationTimer.unref?.();

const kickValidationTimer = setInterval(() => {
  if (!kickRuntimeConfig.accessToken || kickRuntimeConfig.tokenSource !== "oauth") {
    return;
  }

  ensureKickTokenIsUsable().catch((error) => {
    statuses.set("kick", "error", `Kick token refresh failed: ${String(error)}`);
  });
}, 60 * 60 * 1000);
kickValidationTimer.unref?.();

process.once("SIGINT", () => {
  clearInterval(viewerRefreshTimer);
  clearInterval(twitchValidationTimer);
  clearInterval(kickValidationTimer);
  twitchWorker?.stop();
  xWorker?.stop();
  stopXLiveChatWorker();
  for (const worker of workers) {
    worker.stop();
  }
  process.exit(0);
});

process.once("SIGTERM", () => {
  clearInterval(viewerRefreshTimer);
  clearInterval(twitchValidationTimer);
  clearInterval(kickValidationTimer);
  twitchWorker?.stop();
  xWorker?.stop();
  stopXLiveChatWorker();
  for (const worker of workers) {
    worker.stop();
  }
  process.exit(0);
});

async function attachClientApp() {
  if (isProduction) {
    const clientDist = path.join(projectRoot, "dist/client");
    app.use(express.static(clientDist));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
    return;
  }

  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer
      }
    },
    appType: "spa"
  });

  app.use(vite.middlewares);
}

await attachClientApp();

httpServer.listen(port, () => {
  console.log(`LS Chat listening at http://localhost:${port}`);
});
