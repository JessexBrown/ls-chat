import { z } from "zod";
import {
  chatMessageSchema,
  makeMessageId,
  textFragment,
  type ChatMessage,
  type MessageFragment
} from "../../shared/chat";

const twitchEmoteSchema = z
  .object({
    id: z.string()
  })
  .passthrough();

const twitchFragmentSchema = z
  .object({
    type: z.string(),
    text: z.string(),
    emote: twitchEmoteSchema.nullable().optional(),
    mention: z.unknown().nullable().optional(),
    cheermote: z.unknown().nullable().optional()
  })
  .passthrough();

const twitchBadgeSchema = z
  .object({
    set_id: z.string(),
    id: z.string(),
    info: z.string().optional()
  })
  .passthrough();

export const twitchEventSubPayloadSchema = z
  .object({
    subscription: z
      .object({
        type: z.string()
      })
      .passthrough()
      .optional(),
    event: z
      .object({
        broadcaster_user_id: z.string(),
        broadcaster_user_login: z.string(),
        broadcaster_user_name: z.string(),
        chatter_user_id: z.string(),
        chatter_user_login: z.string(),
        chatter_user_name: z.string(),
        message_id: z.string(),
        message: z.object({
          text: z.string(),
          fragments: z.array(twitchFragmentSchema).optional()
        }),
        color: z.string().nullable().optional(),
        badges: z.array(twitchBadgeSchema).optional()
      })
      .passthrough()
  })
  .passthrough();

function twitchEmoteUrl(emoteId: string) {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emoteId)}/default/dark/1.0`;
}

function normalizeFragment(fragment: z.infer<typeof twitchFragmentSchema>): MessageFragment {
  if (fragment.type === "emote") {
    return {
      type: "emote",
      text: fragment.text,
      url: fragment.emote?.id ? twitchEmoteUrl(fragment.emote.id) : null
    };
  }

  if (fragment.type === "mention" || fragment.type === "cheermote") {
    return {
      type: fragment.type,
      text: fragment.text,
      url: null
    };
  }

  return textFragment(fragment.text);
}

export function normalizeTwitchChatMessage(payload: unknown): ChatMessage | null {
  const parsed = twitchEventSubPayloadSchema.parse(payload);

  if (parsed.subscription?.type && parsed.subscription.type !== "channel.chat.message") {
    return null;
  }

  const event = parsed.event;
  const fragments = event.message.fragments?.map(normalizeFragment) ?? [textFragment(event.message.text)];

  return chatMessageSchema.parse({
    id: makeMessageId("twitch", event.message_id),
    platform: "twitch",
    sourceKind: "chat",
    platformMessageId: event.message_id,
    platformUserId: event.chatter_user_id,
    username: event.chatter_user_login,
    displayName: event.chatter_user_name,
    channelId: event.broadcaster_user_id,
    channelName: event.broadcaster_user_name || event.broadcaster_user_login,
    message: event.message.text,
    fragments,
    badges:
      event.badges?.map((badge) => ({
        label: badge.set_id,
        type: badge.id,
        count: badge.info && /^\d+$/.test(badge.info) ? Number(badge.info) : null
      })) ?? [],
    avatarUrl: null,
    color: event.color ?? null,
    sentAt: null,
    receivedAt: new Date().toISOString(),
    raw: payload
  });
}
