import type { MessageFragment } from "./chat";

export type BetterTtvEmoteMap = Record<string, string>;

type BetterTtvEmotePayload = {
  id?: unknown;
  code?: unknown;
};

export function betterTtvEmoteUrl(id: string) {
  return `https://cdn.betterttv.net/emote/${encodeURIComponent(id)}/1x`;
}

export function normalizeBetterTtvEmoteMap(value: unknown): BetterTtvEmoteMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce<BetterTtvEmoteMap>((emotes, [code, url]) => {
    if (typeof url === "string") {
      emotes[code] = url;
    }
    return emotes;
  }, {});
}

export function parseBetterTtvEmoteList(value: unknown): BetterTtvEmoteMap {
  if (!Array.isArray(value)) {
    return {};
  }

  return value.reduce<BetterTtvEmoteMap>((emotes, item) => {
    if (!item || typeof item !== "object") {
      return emotes;
    }

    const emote = item as BetterTtvEmotePayload;
    if (typeof emote.id === "string" && typeof emote.code === "string") {
      emotes[emote.code] = betterTtvEmoteUrl(emote.id);
    }
    return emotes;
  }, {});
}

export function parseBetterTtvChannelPayload(value: unknown): BetterTtvEmoteMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const payload = value as { channelEmotes?: unknown; sharedEmotes?: unknown };
  return {
    ...parseBetterTtvEmoteList(payload.channelEmotes),
    ...parseBetterTtvEmoteList(payload.sharedEmotes)
  };
}

export function expandBetterTtvFragments(fragments: MessageFragment[], emotes: BetterTtvEmoteMap): MessageFragment[] {
  if (Object.keys(emotes).length === 0) {
    return fragments;
  }

  return fragments.flatMap((fragment) => {
    if (fragment.type !== "text") {
      return [fragment];
    }

    return fragment.text.split(/(\s+)/).map<MessageFragment>((token) => {
      const url = emotes[token];
      return url
        ? {
            type: "emote",
            text: token,
            url
          }
        : {
            type: "text",
            text: token,
            url: null
          };
    });
  });
}
