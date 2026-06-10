import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const liveSessionSchema = z.object({
  id: z.string().trim().min(1).default("default"),
  title: z.string().trim().min(1).max(80).default("MarketBubble Live"),
  nativeChatLabel: z.string().trim().min(1).max(40).default("MarketBubble"),
  streamEmbedUrl: z.string().url().nullable().default(null),
  streamWatchUrl: z.string().url().nullable().default(null),
  description: z.string().trim().max(240).default(""),
  updatedAt: z.string().datetime()
});

export type LiveSession = z.infer<typeof liveSessionSchema>;

export const liveSessionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  nativeChatLabel: z.string().trim().min(1).max(40).optional(),
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
    const next = liveSessionSchema.parse({
      ...this.session,
      title: update.title ?? this.session.title,
      nativeChatLabel: update.nativeChatLabel ?? this.session.nativeChatLabel,
      streamEmbedUrl: normalizeNullableUrl(update.streamEmbedUrl, this.session.streamEmbedUrl),
      streamWatchUrl: normalizeNullableUrl(update.streamWatchUrl, this.session.streamWatchUrl),
      description: update.description ?? this.session.description,
      updatedAt: new Date().toISOString()
    });

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
      return liveSessionSchema.parse({
        ...this.defaultSession(),
        ...(raw && typeof raw === "object" ? raw : {})
      });
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
