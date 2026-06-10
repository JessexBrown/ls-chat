import { describe, expect, it } from "vitest";
import { createNativeChatMessage, nativeChatInputSchema } from "./nativeChat";

describe("native MarketBubble chat", () => {
  it("normalizes viewer messages into the unified chat contract", () => {
    const input = nativeChatInputSchema.parse({
      username: "  desk_viewer  ",
      message: "  hello from MarketBubble  "
    });
    const message = createNativeChatMessage(input, {
      nativeChatLabel: "MarketBubble",
      streamWatchUrl: "https://www.marketbubble.com/live",
      now: "2026-06-10T16:00:00.000Z",
      platformMessageId: "native-test"
    });

    expect(message).toMatchObject({
      id: "marketbubble:native-test",
      platform: "marketbubble",
      sourceKind: "chat",
      username: "desk_viewer",
      channelName: "MarketBubble",
      sourceId: "marketbubble:native-live",
      sourceLabel: "MarketBubble",
      sourceUrl: "https://www.marketbubble.com/live",
      message: "hello from MarketBubble"
    });
    expect(message.badges[0]).toMatchObject({ label: "Native" });
  });

  it("rejects empty native messages", () => {
    expect(() => nativeChatInputSchema.parse({ username: "viewer", message: "   " })).toThrow();
  });
});
