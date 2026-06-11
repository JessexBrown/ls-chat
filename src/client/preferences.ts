export type MessageStyle = "classic" | "compact" | "minimal";

export type ChatPreferences = {
  messageStyle: MessageStyle;
  showPlatform: boolean;
  showTimestamp: boolean;
  showSource: boolean;
  showEmotes: boolean;
  showBetterTtvEmotes: boolean;
};

export const chatPreferenceStorageKey = "ls-chat-preferences";

export const messageStyleOptions: Array<{ id: MessageStyle; label: string; description: string }> = [
  { id: "classic", label: "Classic", description: "Platform, time, source, username, and message." },
  { id: "compact", label: "Compact", description: "Dense rows with source context kept tight." },
  { id: "minimal", label: "Minimal", description: "Username and message stay primary." }
];

export const defaultChatPreferences: ChatPreferences = {
  messageStyle: "classic",
  showPlatform: true,
  showTimestamp: true,
  showSource: true,
  showEmotes: true,
  showBetterTtvEmotes: true
};

export function normalizeChatPreferences(value: unknown): ChatPreferences {
  if (!value || typeof value !== "object") {
    return { ...defaultChatPreferences };
  }

  const candidate = value as Partial<Record<keyof ChatPreferences, unknown>>;
  const messageStyle = messageStyleOptions.some((option) => option.id === candidate.messageStyle)
    ? (candidate.messageStyle as MessageStyle)
    : defaultChatPreferences.messageStyle;

  return {
    messageStyle,
    showPlatform: typeof candidate.showPlatform === "boolean" ? candidate.showPlatform : defaultChatPreferences.showPlatform,
    showTimestamp: typeof candidate.showTimestamp === "boolean" ? candidate.showTimestamp : defaultChatPreferences.showTimestamp,
    showSource: typeof candidate.showSource === "boolean" ? candidate.showSource : defaultChatPreferences.showSource,
    showEmotes: typeof candidate.showEmotes === "boolean" ? candidate.showEmotes : defaultChatPreferences.showEmotes,
    showBetterTtvEmotes:
      typeof candidate.showBetterTtvEmotes === "boolean" ? candidate.showBetterTtvEmotes : defaultChatPreferences.showBetterTtvEmotes
  };
}

export function readChatPreferences(storage: Pick<Storage, "getItem">): ChatPreferences {
  const raw = storage.getItem(chatPreferenceStorageKey);
  if (!raw) {
    return { ...defaultChatPreferences };
  }

  try {
    return normalizeChatPreferences(JSON.parse(raw));
  } catch {
    return { ...defaultChatPreferences };
  }
}

export function writeChatPreferences(storage: Pick<Storage, "setItem">, preferences: ChatPreferences) {
  storage.setItem(chatPreferenceStorageKey, JSON.stringify(normalizeChatPreferences(preferences)));
}
