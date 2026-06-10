import { describe, expect, it } from "vitest";
import { buildStreamEmbedUrl, normalizeParentHost } from "./streamEmbeds";

describe("stream embed normalization", () => {
  it("turns Twitch channel URLs into Twitch player URLs with a parent host", () => {
    expect(
      buildStreamEmbedUrl({
        streamEmbedUrl: "https://www.twitch.tv/jynxzi",
        streamWatchUrl: null,
        parentHost: "localhost:4200"
      })
    ).toBe("https://player.twitch.tv/?channel=jynxzi&parent=localhost&autoplay=false");
  });

  it("adds parent to Twitch player URLs when missing", () => {
    expect(
      buildStreamEmbedUrl({
        streamEmbedUrl: "https://player.twitch.tv/?channel=jynxzi",
        streamWatchUrl: null,
        parentHost: "subscript-emphases-auction.ngrok-free.dev"
      })
    ).toBe("https://player.twitch.tv/?channel=jynxzi&parent=subscript-emphases-auction.ngrok-free.dev");
  });

  it("normalizes parent hosts without ports", () => {
    expect(normalizeParentHost("https://example.com:4200")).toBe("example.com");
    expect(normalizeParentHost("127.0.0.1:4200")).toBe("127.0.0.1");
  });
});
