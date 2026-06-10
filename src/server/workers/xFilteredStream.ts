import { normalizeXFilteredStreamPost } from "../adapters/x";
import type { ChatMessage } from "../../shared/chat";
import type { IntegrationStatusStore } from "./status";

type PublishMessage = (message: ChatMessage | null) => void;

type XFilteredStreamRule = {
  value: string;
  tag?: string;
};

type XFilteredStreamWorkerOptions = {
  bearerToken: string;
  rules: XFilteredStreamRule[];
  publish: PublishMessage;
  statuses: IntegrationStatusStore;
};

const X_STREAM_URL =
  "https://api.x.com/2/tweets/search/stream?tweet.fields=created_at,author_id&expansions=author_id&user.fields=username,name,profile_image_url";

export function parseXRules(value: string | undefined): XFilteredStreamRule[] {
  if (!value) {
    return [];
  }

  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [ruleValue, tag] = entry.split("|").map((part) => part.trim());
      return tag ? { value: ruleValue, tag } : { value: ruleValue };
    })
    .filter((rule) => rule.value.length > 0);
}

export class XFilteredStreamWorker {
  private readonly options: XFilteredStreamWorkerOptions;
  private reconnectAttempt = 0;
  private abortController: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: XFilteredStreamWorkerOptions) {
    this.options = options;
  }

  start() {
    this.clearReconnectTimer();
    this.abortController = new AbortController();
    this.connect(this.abortController.signal).catch((error) => {
      this.options.statuses.set("x", "error", `X Filtered Stream failed: ${String(error)}`);
      this.scheduleReconnect();
    });
  }

  stop() {
    this.clearReconnectTimer();
    this.abortController?.abort();
    this.abortController = null;
    this.options.statuses.set("x", "disabled", "X Filtered Stream worker stopped.");
  }

  private async connect(signal: AbortSignal) {
    this.options.statuses.set("x", "connecting", "Preparing X Filtered Stream.");
    await this.ensureRules(signal);

    this.options.statuses.set("x", "connecting", "Connecting to X Filtered Stream.");
    const response = await fetch(X_STREAM_URL, {
      headers: {
        Authorization: `Bearer ${this.options.bearerToken}`
      },
      signal
    });

    if (!response.ok || !response.body) {
      const body = await response.text();
      throw new Error(`X stream failed with ${response.status}: ${body}`);
    }

    this.reconnectAttempt = 0;
    this.options.statuses.set("x", "connected", "Connected to X Filtered Stream.");
    await this.readStream(response.body, signal);
  }

  private async ensureRules(signal: AbortSignal) {
    if (this.options.rules.length === 0) {
      return;
    }

    const currentResponse = await fetch("https://api.x.com/2/tweets/search/stream/rules", {
      headers: {
        Authorization: `Bearer ${this.options.bearerToken}`
      },
      signal
    });

    if (!currentResponse.ok) {
      const body = await currentResponse.text();
      throw new Error(`Unable to read X stream rules: ${currentResponse.status} ${body}`);
    }

    const current = (await currentResponse.json()) as { data?: Array<{ value: string; tag?: string }> };
    const existing = new Set((current.data ?? []).map((rule) => `${rule.value}|${rule.tag ?? ""}`));
    const missingRules = this.options.rules.filter((rule) => !existing.has(`${rule.value}|${rule.tag ?? ""}`));

    if (missingRules.length === 0) {
      return;
    }

    const addResponse = await fetch("https://api.x.com/2/tweets/search/stream/rules", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.bearerToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ add: missingRules }),
      signal
    });

    if (!addResponse.ok) {
      const body = await addResponse.text();
      throw new Error(`Unable to add X stream rules: ${addResponse.status} ${body}`);
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        this.options.publish(normalizeXFilteredStreamPost(JSON.parse(trimmed)));
      }
    }

    if (!signal.aborted) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    const delayMs = Math.min(30000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.options.statuses.set("x", "connecting", `Reconnecting to X Filtered Stream in ${delayMs / 1000}s.`);
    this.reconnectTimer = setTimeout(() => this.start(), delayMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
