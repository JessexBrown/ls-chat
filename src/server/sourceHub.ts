import { viewerSnapshotSchema, viewerSourceSchema, type Platform, type ViewerSnapshot, type ViewerSource } from "../shared/chat";

type SourceListener = (snapshot: ViewerSnapshot) => void;

export type ViewerSourceInput = Partial<ViewerSource> & {
  id: string;
  platform: Platform;
  label: string;
};

export class SourceHub {
  private readonly sources = new Map<string, ViewerSource>();
  private readonly listeners = new Set<SourceListener>();

  upsert(input: ViewerSourceInput) {
    const now = new Date().toISOString();
    const previous = this.sources.get(input.id);
    const next = viewerSourceSchema.parse({
      ...previous,
      ...input,
      channelId: input.channelId ?? previous?.channelId ?? null,
      channelName: input.channelName ?? previous?.channelName ?? null,
      sourceUrl: input.sourceUrl ?? previous?.sourceUrl ?? null,
      viewerCount: input.viewerCount === undefined ? previous?.viewerCount ?? null : input.viewerCount,
      chattersCount: input.chattersCount === undefined ? previous?.chattersCount ?? null : input.chattersCount,
      status: input.status ?? previous?.status ?? "unknown",
      detail: input.detail === undefined ? previous?.detail ?? null : input.detail,
      updatedAt: input.updatedAt ?? now
    });

    this.sources.set(input.id, next);
    this.notify();
    return next;
  }

  remove(id: string) {
    const removed = this.sources.delete(id);
    if (removed) {
      this.notify();
    }
    return removed;
  }

  snapshot() {
    const sources = Array.from(this.sources.values()).sort((left, right) => {
      const platformSort = left.platform.localeCompare(right.platform);
      return platformSort || left.label.localeCompare(right.label);
    });
    const totalKnownViewers = sources.reduce((total, source) => total + (source.viewerCount ?? 0), 0);
    const unknownSourceCount = sources.filter((source) => source.viewerCount === null).length;

    return viewerSnapshotSchema.parse({
      sources,
      totalKnownViewers,
      unknownSourceCount,
      updatedAt: new Date().toISOString()
    });
  }

  subscribe(listener: SourceListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
