import { describe, expect, it } from "vitest";
import { isNativeMarketBubbleMessage, isNativeMarketBubbleMessageId } from "../shared/chat";
import { createNativeChatMessage, nativeChatInputSchema } from "./nativeChat";

describe("native Market Bubble chat", () => {
  it("normalizes viewer messages into the unified chat contract", () => {
    const input = nativeChatInputSchema.parse({
      clientId: "guest_test_1234",
      username: "  desk_viewer  ",
      message: "  hello from Market Bubble  "
    });
    const message = createNativeChatMessage(input, {
      nativeChatLabel: "Market Bubble",
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
      channelName: "Market Bubble",
      sourceId: "marketbubble:native-live",
      sourceLabel: "Market Bubble",
      sourceUrl: "https://www.marketbubble.com/live",
      message: "hello from Market Bubble"
    });
    expect(message.badges).toEqual([]);
    expect(message.raw).toMatchObject({ clientId: "guest_test_1234" });
  });

  it("rejects empty native messages", () => {
    expect(() => nativeChatInputSchema.parse({ username: "viewer", message: "   " })).toThrow();
  });

  it("distinguishes native Market Bubble messages from local mock Market Bubble messages", () => {
    const nativeMessage = createNativeChatMessage(
      { clientId: "guest_test_1234", username: "desk_viewer", message: "native message" },
      {
        nativeChatLabel: "Market Bubble",
        streamWatchUrl: "https://www.marketbubble.com/live",
        now: "2026-06-10T16:00:00.000Z",
        platformMessageId: "native-test"
      }
    );

    expect(isNativeMarketBubbleMessage(nativeMessage)).toBe(true);
    expect(isNativeMarketBubbleMessageId(nativeMessage.id)).toBe(true);
    expect(
      isNativeMarketBubbleMessage({
        ...nativeMessage,
        platformMessageId: "mock-test",
        sourceId: "local-dev:marketbubble",
        channelId: "local-dev-channel"
      })
    ).toBe(false);
  });
});
