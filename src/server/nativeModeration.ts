export type NativeMuteRecord = {
  userId: string;
  displayName: string | null;
  mutedAt: string;
  reason: string | null;
  networkKeyCount: number;
};

export class NativeModerationStore {
  private readonly mutedUsers = new Map<string, NativeMuteRecord>();
  private readonly userNetworkKeys = new Map<string, Set<string>>();
  private readonly mutedNetworkKeys = new Map<string, string>();

  mute(input: {
    userId: string;
    displayName?: string | null;
    reason?: string | null;
    now?: string;
    networkKeys?: Iterable<string>;
  }) {
    const networkKeys = new Set(Array.from(input.networkKeys ?? []).filter(Boolean));
    const record: NativeMuteRecord = {
      userId: input.userId,
      displayName: input.displayName ?? null,
      mutedAt: input.now ?? new Date().toISOString(),
      reason: input.reason ?? null,
      networkKeyCount: networkKeys.size
    };

    this.clearNetworkKeys(input.userId);
    this.mutedUsers.set(input.userId, record);
    this.userNetworkKeys.set(input.userId, networkKeys);

    for (const networkKey of networkKeys) {
      this.mutedNetworkKeys.set(networkKey, input.userId);
    }

    return record;
  }

  unmute(userId: string) {
    const removed = this.mutedUsers.delete(userId);
    this.clearNetworkKeys(userId);
    return removed;
  }

  isMuted(input: { userId?: string | null; networkKey?: string | null }) {
    return Boolean(
      (input.userId && this.mutedUsers.has(input.userId)) ||
        (input.networkKey && this.mutedNetworkKeys.has(input.networkKey))
    );
  }

  snapshot() {
    return Array.from(this.mutedUsers.values()).sort((a, b) => b.mutedAt.localeCompare(a.mutedAt));
  }

  get size() {
    return this.mutedUsers.size;
  }

  get mutedNetworkKeyCount() {
    return this.mutedNetworkKeys.size;
  }

  private clearNetworkKeys(userId: string) {
    const existingKeys = this.userNetworkKeys.get(userId);
    if (!existingKeys) {
      return;
    }

    for (const networkKey of existingKeys) {
      this.mutedNetworkKeys.delete(networkKey);
    }

    this.userNetworkKeys.delete(userId);
  }
}
