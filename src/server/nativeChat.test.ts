import { describe, expect, it } from "vitest";
import { createNativeChatMessage, nativeChatInputSchema } from "./nativeChat";

describe("native MarketBubble chat", () => {
  it("normalizes viewer messages into the unified chat contract", () => {
    const input = nativeChatInputSchema.parse({
      clientId: "guest_test_1234",
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
      platformUserId: "marketbubble:guest_test_1234",
      username: "desk_viewer",
      channelName: "MarketBubble",
      sourceId: "marketbubble:native-live",
      sourceLabel: "MarketBubble",
      sourceUrl: "https://www.marketbubble.com/live",
      message: "hello from MarketBubble"
    });
    expect(message.badges).toEqual([]);
    expect(message.raw).toMatchObject({ clientId: "guest_test_1234" });
  });

  it("rejects empty native messages", () => {
    expect(() => nativeChatInputSchema.parse({ username: "viewer", message: "   " })).toThrow();
  });
});
