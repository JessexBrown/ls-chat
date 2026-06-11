import { describe, expect, it } from "vitest";
import {
  expandBetterTtvFragments,
  normalizeBetterTtvEmoteMap,
  parseBetterTtvChannelPayload,
  parseBetterTtvEmoteList
} from "../shared/betterTtv";

describe("BetterTTV emotes", () => {
  it("parses global emote payloads into renderable URLs", () => {
    expect(parseBetterTtvEmoteList([{ id: "abc123", code: "monkaS" }])).toEqual({
      monkaS: "https://cdn.betterttv.net/emote/abc123/1x"
    });
  });

  it("parses channel and shared emote payloads", () => {
    expect(
      parseBetterTtvChannelPayload({
        channelEmotes: [{ id: "channel-id", code: "channelDance" }],
        sharedEmotes: [{ id: "shared-id", code: "widepeepoHappy" }]
      })
    ).toMatchObject({
      channelDance: "https://cdn.betterttv.net/emote/channel-id/1x",
      widepeepoHappy: "https://cdn.betterttv.net/emote/shared-id/1x"
    });
  });

  it("normalizes first-party API emote maps", () => {
    expect(
      normalizeBetterTtvEmoteMap({
        monkaS: "https://cdn.betterttv.net/emote/abc123/1x",
        bad: 12
      })
    ).toEqual({
      monkaS: "https://cdn.betterttv.net/emote/abc123/1x"
    });
  });

  it("expands text tokens while preserving spacing", () => {
    expect(
      expandBetterTtvFragments([{ type: "text", text: "hello monkaS chat", url: null }], {
        monkaS: "https://cdn.betterttv.net/emote/abc123/1x"
      })
    ).toEqual([
      { type: "text", text: "hello", url: null },
      { type: "text", text: " ", url: null },
      { type: "emote", text: "monkaS", url: "https://cdn.betterttv.net/emote/abc123/1x" },
      { type: "text", text: " ", url: null },
      { type: "text", text: "chat", url: null }
    ]);
  });
});
