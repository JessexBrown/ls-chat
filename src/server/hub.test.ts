import { describe, expect, it } from "vitest";
import type { ChatMessage, Platform } from "../shared/chat";
import { textFragment } from "../shared/chat";
import { ChatHub } from "./hub";

function message(id: string, platform: Platform = "twitch"): ChatMessage {
  return {
    id,
    platform,
    sourceKind: "chat",
    platformMessageId: id,
    platformUserId: `user-${id}`,
    username: `user_${id}`,
    displayName: `User ${id}`,
    channelId: "channel",
    channelName: "channel",
    sourceId: `${platform}:channel`,
    sourceLabel: "channel",
    sourceUrl: null,
    message: `message ${id}`,
    fragments: [textFragment(`message ${id}`)],
    badges: [],
    avatarUrl: null,
    color: null,
    sentAt: "2026-06-10T18:00:00.000Z",
    receivedAt: "2026-06-10T18:00:00.000Z"
  };
}

describe("ChatHub", () => {
  it("trims retained messages when the limit is lowered and allows evicted ids again", () => {
    const hub = new ChatHub(3);

    expect(hub.add(message("1"))).toBe(true);
    expect(hub.add(message("2"))).toBe(true);
    expect(hub.add(message("3"))).toBe(true);

    hub.setMaxMessages(2);

    expect(hub.snapshot().map((item) => item.id)).toEqual(["2", "3"]);
    expect(hub.add(message("1"))).toBe(true);
    expect(hub.snapshot().map((item) => item.id)).toEqual(["3", "1"]);
  });

  it("removes a retained message and allows the id to be used again", () => {
    const hub = new ChatHub(3);

    expect(hub.add(message("1", "marketbubble"))).toBe(true);
    expect(hub.add(message("2", "marketbubble"))).toBe(true);

    const removed = hub.remove("1");

    expect(removed?.id).toBe("1");
    expect(hub.snapshot().map((item) => item.id)).toEqual(["2"]);
    expect(hub.add(message("1", "marketbubble"))).toBe(true);
  });

  it("returns null when removing an unknown message", () => {
    const hub = new ChatHub(3);

    expect(hub.remove("missing")).toBeNull();
  });
});
