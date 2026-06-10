import crypto from "node:crypto";
import { z } from "zod";
import { chatMessageSchema, makeMessageId, textFragment, type ChatMessage } from "../shared/chat";

export const nativeChatInputSchema = z.object({
  username: z.string().trim().min(1).max(32).default("marketbubble-viewer"),
  message: z.string().trim().min(1).max(500)
});

export type NativeChatInput = z.infer<typeof nativeChatInputSchema>;

type NativeChatMessageOptions = {
  nativeChatLabel: string;
  streamWatchUrl: string | null;
  now?: string;
  platformMessageId?: string;
};

export function createNativeChatMessage(input: NativeChatInput, options: NativeChatMessageOptions): ChatMessage {
  const now = options.now ?? new Date().toISOString();
  const platformMessageId = options.platformMessageId ?? `native-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  return chatMessageSchema.parse({
    id: makeMessageId("marketbubble", platformMessageId),
    platform: "marketbubble",
    sourceKind: "chat",
    platformMessageId,
    platformUserId: input.username,
    username: input.username,
    displayName: input.username,
    channelId: "marketbubble-native-live",
    channelName: options.nativeChatLabel,
    sourceId: "marketbubble:native-live",
    sourceLabel: options.nativeChatLabel,
    sourceUrl: options.streamWatchUrl,
    message: input.message,
    fragments: [textFragment(input.message)],
    badges: [{ label: "Native", type: "marketbubble-native", count: null }],
    avatarUrl: null,
    color: "#e8ff9c",
    sentAt: now,
    receivedAt: now
  });
}
