import { z } from "zod";
import crypto from "node:crypto";
import {
  chatMessageSchema,
  makeMessageId,
  normalizeTimestamp,
  textFragment,
  type ChatMessage
} from "../../shared/chat";

const xUserSchema = z
  .object({
    id: z.string(),
    username: z.string().optional(),
    name: z.string().optional(),
    profile_image_url: z.string().optional()
  })
  .passthrough();

export const xFilteredStreamPayloadSchema = z
  .object({
    data: z
      .object({
        id: z.string(),
        text: z.string(),
        author_id: z.string().optional(),
        username: z.string().optional(),
        created_at: z.string().optional()
      })
      .passthrough(),
    includes: z
      .object({
        users: z.array(xUserSchema).optional()
      })
      .passthrough()
      .optional(),
    matching_rules: z
      .array(
        z
          .object({
            id: z.string(),
            tag: z.string().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

export function normalizeXFilteredStreamPost(payload: unknown): ChatMessage {
  const parsed = xFilteredStreamPayloadSchema.parse(payload);
  const author = parsed.includes?.users?.find((user) => user.id === parsed.data.author_id);
  const username = parsed.data.username ?? author?.username ?? parsed.data.author_id ?? "unknown-x-user";
  const displayName = author?.name ?? username;
  const ruleTag = parsed.matching_rules?.[0]?.tag ?? "X Filtered Stream";
  const sentAt = normalizeTimestamp(parsed.data.created_at);

  return chatMessageSchema.parse({
    id: makeMessageId("x", parsed.data.id),
    platform: "x",
    sourceKind: "public_post",
    platformMessageId: parsed.data.id,
    platformUserId: parsed.data.author_id ?? null,
    username,
    displayName,
    channelId: parsed.matching_rules?.[0]?.id ?? null,
    channelName: ruleTag,
    message: parsed.data.text,
    fragments: [textFragment(parsed.data.text)],
    badges: [],
    avatarUrl: author?.profile_image_url ?? null,
    color: null,
    sentAt,
    receivedAt: new Date().toISOString(),
    raw: payload
  });
}

export const xLiveCapturePayloadSchema = z
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

export type XLiveCapturePayload = z.infer<typeof xLiveCapturePayloadSchema>;

function captureMessageId(payload: XLiveCapturePayload) {
  if (payload.platformMessageId) {
    return payload.platformMessageId;
  }

  const fingerprint = crypto
    .createHash("sha256")
    .update(
      [
        payload.sourceUrl ?? "",
        payload.channelName ?? "",
        payload.username,
        payload.message,
        payload.sentAt ?? payload.capturedAt ?? ""
      ].join("|")
    )
    .digest("hex")
    .slice(0, 32);

  return `live-capture:${fingerprint}`;
}

export function normalizeXLiveCaptureMessage(payload: unknown, defaults: { channelName?: string | null } = {}): ChatMessage {
  const parsed = xLiveCapturePayloadSchema.parse(payload);
  const now = new Date().toISOString();
  const sentAt = normalizeTimestamp(parsed.sentAt ?? parsed.capturedAt);

  return chatMessageSchema.parse({
    id: makeMessageId("x", captureMessageId(parsed)),
    platform: "x",
    sourceKind: "chat",
    platformMessageId: captureMessageId(parsed),
    platformUserId: parsed.platformUserId ?? parsed.username,
    username: parsed.username,
    displayName: parsed.displayName ?? parsed.username,
    channelId: parsed.channelId ?? parsed.sourceUrl ?? null,
    channelName: parsed.channelName ?? defaults.channelName ?? "X Live Capture",
    sourceUrl: parsed.sourceUrl ?? null,
    message: parsed.message,
    fragments: [textFragment(parsed.message)],
    badges: [{ label: "Capture", type: "browser-capture", count: null }],
    avatarUrl: parsed.avatarUrl ?? null,
    color: null,
    sentAt,
    receivedAt: now,
    raw: payload
  });
}
