import { describe, expect, it } from "vitest";
import { xLiveChatChannelFromInput, xLiveChatUrlFromInput } from "./xLiveChatCapture";

describe("X livechat capture helpers", () => {
  it("builds X livechat URLs from usernames", () => {
    expect(xLiveChatUrlFromInput("streamer_name")).toBe("https://x.com/streamer_name/livechat");
    expect(xLiveChatChannelFromInput("@streamer_name")).toBe("@streamer_name livechat");
  });

  it("accepts direct X URLs", () => {
    const url = "https://x.com/streamer_name/livechat";
    expect(xLiveChatUrlFromInput(url)).toBe(url);
    expect(xLiveChatChannelFromInput(url)).toBe("@streamer_name livechat");
  });
});
