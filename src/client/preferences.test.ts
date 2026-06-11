import { describe, expect, it } from "vitest";
import {
  chatPreferenceStorageKey,
  defaultChatPreferences,
  normalizeChatPreferences,
  readChatPreferences,
  writeChatPreferences
} from "./preferences";

describe("chat preferences", () => {
  it("falls back to defaults for invalid preference payloads", () => {
    expect(normalizeChatPreferences(null)).toEqual(defaultChatPreferences);
    expect(normalizeChatPreferences({ messageStyle: "loud", showPlatform: "yes" })).toEqual(defaultChatPreferences);
  });

  it("keeps supported display toggles", () => {
    expect(
      normalizeChatPreferences({
        messageStyle: "minimal",
        showPlatform: false,
        showTimestamp: false,
        showSource: false,
        showEmotes: false,
        showBetterTtvEmotes: false
      })
    ).toEqual({
      messageStyle: "minimal",
      showPlatform: false,
      showTimestamp: false,
      showSource: false,
      showEmotes: false,
      showBetterTtvEmotes: false
    });
  });

  it("round-trips preferences through storage", () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    };

    writeChatPreferences(storageLike, {
      messageStyle: "compact",
      showPlatform: true,
      showTimestamp: false,
      showSource: true,
      showEmotes: true,
      showBetterTtvEmotes: false
    });

    expect(storage.has(chatPreferenceStorageKey)).toBe(true);
    expect(readChatPreferences(storageLike)).toMatchObject({
      messageStyle: "compact",
      showTimestamp: false,
      showBetterTtvEmotes: false
    });
  });
});
