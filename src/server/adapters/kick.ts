import { z } from "zod";
import {
  chatMessageSchema,
  makeMessageId,
  normalizeTimestamp,
  textFragment,
  type ChatMessage
} from "../../shared/chat";

const kickBadgeSchema = z.object({
  text: z.string(),
  type: z.string(),
  count: z.number().optional()
});

const kickUserSchema = z
  .object({
    user_id: z.union([z.number(), z.string()]).nullable().optional(),
    username: z.string().nullable().optional(),
    profile_picture: z.string().nullable().optional(),
    channel_slug: z.string().nullable().optional(),
    identity: z
      .object({
        username_color: z.string().nullable().optional(),
        badges: z.array(kickBadgeSchema).nullable().optional()
      })
      .nullable()
      .optional()
  })
  .passthrough();

export const kickChatMessagePayloadSchema = z
  .object({
    message_id: z.string(),
    broadcaster: kickUserSchema.optional(),
    sender: kickUserSchema,
    content: z.string(),
    created_at: z.string().optional()
  })
  .passthrough();

export function normalizeKickChatMessage(payload: unknown): ChatMessage {
  const parsed = kickChatMessagePayloadSchema.parse(payload);
  const username = parsed.sender.username ?? "unknown-kick-user";
  const sentAt = normalizeTimestamp(parsed.created_at);
  const platformMessageId = parsed.message_id;

  return chatMessageSchema.parse({
    id: makeMessageId("kick", platformMessageId),
    platform: "kick",
    sourceKind: "chat",
    platformMessageId,
    platformUserId:
      parsed.sender.user_id === undefined || parsed.sender.user_id === null
        ? null
        : String(parsed.sender.user_id),
    username,
    displayName: username,
    channelId:
      parsed.broadcaster?.user_id === undefined || parsed.broadcaster.user_id === null
        ? null
        : String(parsed.broadcaster.user_id),
    channelName: parsed.broadcaster?.username ?? parsed.broadcaster?.channel_slug ?? null,
    message: parsed.content,
    fragments: [textFragment(parsed.content)],
    badges:
      parsed.sender.identity?.badges?.map((badge) => ({
        label: badge.text,
        type: badge.type,
        count: badge.count ?? null
      })) ?? [],
    avatarUrl: parsed.sender.profile_picture || null,
    color: parsed.sender.identity?.username_color ?? null,
    sentAt,
    receivedAt: new Date().toISOString(),
    raw: payload
  });
}
