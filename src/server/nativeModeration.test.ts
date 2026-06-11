import { describe, expect, it } from "vitest";
import { NativeModerationStore } from "./nativeModeration";

describe("NativeModerationStore", () => {
  it("mutes and unmutes native guest ids", () => {
    const store = new NativeModerationStore();

    const record = store.mute({
      userId: "marketbubble:guest_1234",
      displayName: "Guest 1234",
      now: "2026-06-11T06:00:00.000Z",
      networkKeys: ["network-browser-key"]
    });

    expect(record).toMatchObject({
      userId: "marketbubble:guest_1234",
      displayName: "Guest 1234",
      mutedAt: "2026-06-11T06:00:00.000Z",
      networkKeyCount: 1
    });
    expect(store.isMuted({ userId: "marketbubble:guest_1234" })).toBe(true);
    expect(store.isMuted({ userId: "marketbubble:new_guest", networkKey: "network-browser-key" })).toBe(true);
    expect(store.size).toBe(1);
    expect(store.mutedNetworkKeyCount).toBe(1);
    expect(store.snapshot()).toEqual([record]);

    expect(store.unmute("marketbubble:guest_1234")).toBe(true);
    expect(store.isMuted({ userId: "marketbubble:guest_1234" })).toBe(false);
    expect(store.isMuted({ userId: "marketbubble:new_guest", networkKey: "network-browser-key" })).toBe(false);
    expect(store.size).toBe(0);
    expect(store.mutedNetworkKeyCount).toBe(0);
  });
});
