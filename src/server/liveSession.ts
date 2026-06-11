import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const liveSessionSchema = z.object({
  id: z.string().trim().min(1).default("default"),
  title: z.string().trim().min(1).max(80).default("Market Bubble Live"),
  nativeChatLabel: z.string().trim().min(1).max(40).default("Market Bubble"),
  streamLabel: z.string().trim().min(1).max(60).nullable().default(null),
  streamEmbedUrl: z.string().url().nullable().default(null),
  streamWatchUrl: z.string().url().nullable().default(null),
  description: z.string().trim().max(240).default(""),
  updatedAt: z.string().datetime()
});

export type LiveSession = z.infer<typeof liveSessionSchema>;

export const liveSessionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  nativeChatLabel: z.string().trim().min(1).max(40).optional(),
  streamLabel: z.union([z.string().trim().min(1).max(60), z.literal(""), z.null()]).optional(),
  streamEmbedUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  streamWatchUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  description: z.string().trim().max(240).optional()
});

export type LiveSessionUpdate = z.infer<typeof liveSessionUpdateSchema>;

type LiveSessionStoreOptions = {
  filePath: string;
  defaults: Omit<LiveSession, "updatedAt">;
};

export class LiveSessionStore {
  private readonly filePath: string;
  private readonly defaults: Omit<LiveSession, "updatedAt">;
  private session: LiveSession;

  constructor(options: LiveSessionStoreOptions) {
    this.filePath = options.filePath;
    this.defaults = options.defaults;
    this.session = this.load();
  }

  get() {
    return this.session;
  }

  update(update: LiveSessionUpdate) {
    const next = normalizeLiveSessionBranding(
      liveSessionSchema.parse({
        ...this.session,
        title: update.title ?? this.session.title,
        nativeChatLabel: update.nativeChatLabel ?? this.session.nativeChatLabel,
        streamLabel: normalizeNullableText(update.streamLabel, this.session.streamLabel),
        streamEmbedUrl: normalizeNullableUrl(update.streamEmbedUrl, this.session.streamEmbedUrl),
        streamWatchUrl: normalizeNullableUrl(update.streamWatchUrl, this.session.streamWatchUrl),
        description: update.description ?? this.session.description,
        updatedAt: new Date().toISOString()
      })
    );

    this.session = next;
    this.save();
    return next;
  }

  private load() {
    if (!fs.existsSync(this.filePath)) {
      return this.defaultSession();
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as unknown;
      return normalizeLiveSessionBranding(
        liveSessionSchema.parse({
          ...this.defaultSession(),
          ...(raw && typeof raw === "object" ? raw : {})
        })
      );
    } catch {
      return this.defaultSession();
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.session, null, 2)}\n`, { mode: 0o600 });
  }

  private defaultSession() {
    return liveSessionSchema.parse({
      ...this.defaults,
      updatedAt: new Date().toISOString()
    });
  }
}

function normalizeNullableUrl(value: LiveSessionUpdate["streamEmbedUrl"], fallback: string | null) {
  if (value === undefined) {
    return fallback;
  }

  return value || null;
}

export function normalizeMarketBubbleBranding(value: string) {
  return value.replace(/\bMarketBubble\b/g, "Market Bubble");
}

function normalizeLiveSessionBranding(session: LiveSession): LiveSession {
  const title = normalizeMarketBubbleBranding(session.title);
  const nativeChatLabel = normalizeMarketBubbleBranding(session.nativeChatLabel);
  const streamLabel = session.streamLabel ? normalizeMarketBubbleBranding(session.streamLabel) : session.streamLabel;

  if (title === session.title && nativeChatLabel === session.nativeChatLabel && streamLabel === session.streamLabel) {
    return session;
  }

  return {
    ...session,
    title,
    nativeChatLabel,
    streamLabel
  };
}

function normalizeNullableText(value: LiveSessionUpdate["streamLabel"], fallback: string | null) {
  if (value === undefined) {
    return fallback;
  }

  return value || null;
}
