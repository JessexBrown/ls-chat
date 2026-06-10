import { z } from "zod";

export const platformSchema = z.enum(["twitch", "kick", "x"]);
export type Platform = z.infer<typeof platformSchema>;

export const sourceKindSchema = z.enum(["chat", "public_post"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const messageFragmentSchema = z.object({
  type: z.enum(["text", "emote", "mention", "cheermote", "link", "unknown"]),
  text: z.string(),
  url: z.string().url().nullable().default(null)
});
export type MessageFragment = z.infer<typeof messageFragmentSchema>;

export const messageBadgeSchema = z.object({
  label: z.string(),
  type: z.string(),
  count: z.number().nullable().default(null)
});
export type MessageBadge = z.infer<typeof messageBadgeSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  sourceKind: sourceKindSchema,
  platformMessageId: z.string(),
  platformUserId: z.string().nullable(),
  username: z.string(),
  displayName: z.string().nullable(),
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  message: z.string(),
  fragments: z.array(messageFragmentSchema).default([]),
  badges: z.array(messageBadgeSchema).default([]),
  avatarUrl: z.string().url().nullable(),
  color: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  receivedAt: z.string().datetime(),
  raw: z.unknown().optional()
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const clientMessageSchema = z.object({
  type: z.literal("message"),
  message: chatMessageSchema
});

export const clientSnapshotSchema = z.object({
  type: z.literal("snapshot"),
  messages: z.array(chatMessageSchema),
  maxMessages: z.number().int().positive().optional()
});

export const clientStatusSchema = z.object({
  type: z.literal("status"),
  status: z.enum(["connected", "heartbeat"])
});

export const websocketEnvelopeSchema = z.union([
  clientMessageSchema,
  clientSnapshotSchema,
  clientStatusSchema
]);
export type WebsocketEnvelope = z.infer<typeof websocketEnvelopeSchema>;

export function makeMessageId(platform: Platform, platformMessageId: string) {
  return `${platform}:${platformMessageId}`;
}

export function normalizeTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function textFragment(text: string): MessageFragment {
  return {
    type: "text",
    text,
    url: null
  };
}
