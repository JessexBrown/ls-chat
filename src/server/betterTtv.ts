import {
  parseBetterTtvChannelPayload,
  parseBetterTtvEmoteList,
  type BetterTtvEmoteMap
} from "../shared/betterTtv";

type BetterTtvFetch = (url: string, init?: RequestInit) => Promise<Response>;

type BetterTtvCacheEntry = {
  emotes: BetterTtvEmoteMap;
  expiresAt: number;
  fetchedAt: string;
};

export type BetterTtvCacheResult = {
  emotes: BetterTtvEmoteMap;
  fetchedAt: string;
  cache: "hit" | "miss" | "stale";
};

export class BetterTtvService {
  private readonly cache = new Map<string, BetterTtvCacheEntry>();
  private readonly fetchImpl: BetterTtvFetch;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: { fetchImpl?: BetterTtvFetch; now?: () => number; ttlMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  }

  globalEmotes() {
    return this.fetchCached("global", "https://api.betterttv.net/3/cached/emotes/global", parseBetterTtvEmoteList);
  }

  twitchChannelEmotes(channelId: string) {
    return this.fetchCached(
      `twitch:${channelId}`,
      `https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(channelId)}`,
      parseBetterTtvChannelPayload,
      true
    );
  }

  private async fetchCached(
    cacheKey: string,
    url: string,
    parse: (payload: unknown) => BetterTtvEmoteMap,
    emptyOnNotFound = false
  ): Promise<BetterTtvCacheResult> {
    const cached = this.cache.get(cacheKey);
    const now = this.now();

    if (cached && cached.expiresAt > now) {
      return {
        emotes: cached.emotes,
        fetchedAt: cached.fetchedAt,
        cache: "hit"
      };
    }

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "MarketBubbleLiveChat/0.1"
        }
      });

      if (response.status === 404 && emptyOnNotFound) {
        return this.store(cacheKey, {});
      }

      if (!response.ok) {
        throw new Error(`BetterTTV responded with ${response.status}`);
      }

      return this.store(cacheKey, parse(await response.json()));
    } catch (error) {
      if (cached) {
        return {
          emotes: cached.emotes,
          fetchedAt: cached.fetchedAt,
          cache: "stale"
        };
      }

      throw error;
    }
  }

  private store(cacheKey: string, emotes: BetterTtvEmoteMap): BetterTtvCacheResult {
    const fetchedAt = new Date(this.now()).toISOString();
    const entry = {
      emotes,
      fetchedAt,
      expiresAt: this.now() + this.ttlMs
    };
    this.cache.set(cacheKey, entry);
    return {
      emotes,
      fetchedAt,
      cache: "miss"
    };
  }
}
