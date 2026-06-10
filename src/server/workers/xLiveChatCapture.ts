import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { normalizeXLiveCaptureMessage } from "../adapters/x";
import type { ChatMessage } from "../../shared/chat";
import type { IntegrationStatusStore } from "./status";

type PublishMessage = (message: ChatMessage | null) => boolean;

type XLiveChatCaptureWorkerOptions = {
  targetUrl: string;
  channelName: string;
  chromePath: string;
  userDataDir: string;
  debugPort: number;
  scanMs: number;
  publish: PublishMessage;
  statuses: IntegrationStatusStore;
};

type CdpTarget = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

type CdpResponse = {
  id?: number;
  result?: unknown;
  error?: {
    message?: string;
  };
};

const X_LIVE_CHAT_SCAN_EXPRESSION = String.raw`
(() => {
  const rowSelector = '[role="listitem"], [data-testid="cellInnerDiv"], article, [data-testid*="chat" i], [aria-label*="chat" i] > div';
  const rootSelector = '[role="log"], [role="list"], [aria-label*="chat" i], [aria-label*="comments" i], [data-testid*="chat" i]';
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const hash = (value) => {
    let hashValue = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hashValue = (hashValue * 33) ^ value.charCodeAt(index);
    }
    return (hashValue >>> 0).toString(36);
  };
  const parseXLiveChatText = (value) => {
    const text = clean(value);
    if (!text || text === 'Chat' || text.length > 500) {
      return null;
    }

    const repostMatch = /^([A-Za-z0-9_]{1,32})\s+(reposted the stream!)$/i.exec(text);
    if (repostMatch) {
      return { username: repostMatch[1], displayName: repostMatch[1], message: repostMatch[2] };
    }

    const handleMatches = Array.from(text.matchAll(/@[A-Za-z0-9_]{1,32}\b/g));
    if (handleMatches.length === 0) {
      return null;
    }

    if (handleMatches.length > 1 && text.length > 180) {
      return null;
    }

    const handleMatch = handleMatches[0];
    const handleIndex = handleMatch.index || 0;
    const handleText = handleMatch[0] || '';
    const displayName = clean(text.slice(0, handleIndex).replace(/^Chat\s+/i, ''));
    const message = clean(text.slice(handleIndex + handleText.length));
    const username = handleText.replace(/^@/, '');

    if (!username || !displayName || !message || username === message || message.length > 500) {
      return null;
    }

    return { username, displayName, message };
  };
  const usefulLines = (element) => {
    const rawText = String(element.innerText || element.textContent || '');
    const text = clean(rawText);
    if (!text || text.length < 2 || text.length > 700) {
      return [];
    }
    return rawText
      .split(/\n+/)
      .map(clean)
      .filter(Boolean)
      .filter((line) => !/^(reply|repost|like|share|views?|view post|show more|translate post)$/i.test(line))
      .filter((line) => !/^\d+\s?(s|m|h|d)$/.test(line));
  };
  const parseRow = (element) => {
    if (!visible(element)) {
      return null;
    }
    const lines = usefulLines(element);
    if (lines.length === 0) {
      return null;
    }
    const combined = clean(lines.join(' '));
    const xLiveChatMatch = parseXLiveChatText(combined);
    if (xLiveChatMatch) {
      return xLiveChatMatch;
    }
    const inlineMatch = /^@?([A-Za-z0-9_]{1,32})\s*[:\-]\s+(.{1,500})$/.exec(combined);
    if (inlineMatch) {
      return { username: inlineMatch[1], displayName: inlineMatch[1], message: inlineMatch[2] };
    }
    const handleLine = lines.find((line) => /^@?[A-Za-z0-9_]{1,32}$/.test(line));
    const username = clean((handleLine || lines[0]).replace(/^@/, ''));
    const messageLines = lines.filter((line) => line !== handleLine && line !== lines[0]);
    const message = clean(messageLines.length > 0 ? messageLines.join(' ') : lines.slice(1).join(' '));
    if (!username || !message || username === message || message.length < 1) {
      return null;
    }
    return { username, displayName: username, message };
  };
  const toPayloads = (candidates) => {
    const seen = new Set();
    return candidates
      .map((candidate) => {
        const parsed = candidate.parsed || parseRow(candidate.element || candidate);
        if (!parsed) {
          return null;
        }
        const signature = hash([location.href, parsed.username, parsed.message].join('|'));
        if (seen.has(signature)) {
          return null;
        }
        seen.add(signature);
        return {
          platformMessageId: 'cdp:' + signature,
          username: parsed.username,
          displayName: parsed.displayName || parsed.username,
          message: parsed.message,
          channelId: location.href,
          sourceUrl: location.href,
          capturedAt: new Date().toISOString()
        };
      })
      .filter(Boolean)
      .slice(-80);
  };
  const chatRoot = document.querySelector('[data-testid="chatContainer"]');
  if (chatRoot && visible(chatRoot)) {
    const parseableRows = Array.from(chatRoot.querySelectorAll('div, article, [role="listitem"]'))
      .filter(visible)
      .map((element) => ({
        element,
        text: clean(element.innerText || element.textContent || ''),
        parsed: parseXLiveChatText(element.innerText || element.textContent || '')
      }))
      .filter((candidate) => candidate.parsed)
      .filter((candidate, _index, candidates) => {
        return !candidates.some((other) => {
          return (
            other !== candidate &&
            candidate.element.contains(other.element) &&
            other.text.length < candidate.text.length
          );
        });
      });

    if (parseableRows.length > 0) {
      return toPayloads(parseableRows);
    }
  }
  const roots = Array.from(document.querySelectorAll(rootSelector))
    .filter(visible)
    .map((element) => ({
      element,
      score:
        element.querySelectorAll(rowSelector).length * 4 +
        Math.min(clean(element.innerText || element.textContent || '').length / 80, 10)
    }))
    .sort((left, right) => right.score - left.score);
  const root = roots[0]?.element || document.body;
  const rows = Array.from(root.querySelectorAll(rowSelector)).filter(visible);
  const candidates = rows.length > 0 ? rows : Array.from(root.children).filter(visible);
  return toPayloads(candidates);
})()
`;

class CdpClient {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  async connect(url: string) {
    this.socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      this.socket?.once("open", () => resolve());
      this.socket?.once("error", reject);
    });

    this.socket.on("message", (data) => this.handleMessage(data.toString()));
    this.socket.on("close", () => {
      for (const request of this.pending.values()) {
        request.reject(new Error("Chrome DevTools connection closed."));
      }
      this.pending.clear();
    });
  }

  send(method: string, params: Record<string, unknown> = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Chrome DevTools connection is not open.");
    }

    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(rawMessage: string) {
    const message = JSON.parse(rawMessage) as CdpResponse;
    if (!message.id) {
      return;
    }

    const request = this.pending.get(message.id);
    if (!request) {
      return;
    }

    this.pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message ?? "Chrome DevTools command failed."));
      return;
    }
    request.resolve(message.result);
  }
}

export class XLiveChatCaptureWorker {
  private readonly options: XLiveChatCaptureWorkerOptions;
  private chromeProcess: ChildProcess | null = null;
  private cdp: CdpClient | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private scanInProgress = false;
  private readonly seenIds = new Set<string>();
  private spawnedChrome = false;
  private targetOpenRequested = false;

  constructor(options: XLiveChatCaptureWorkerOptions) {
    this.options = options;
  }

  async start() {
    this.options.statuses.set("x", "connecting", "Opening X livechat capture browser.");
    await this.ensureChrome();
    await this.connectToTarget();
    await this.scan();
    this.scanTimer = setInterval(() => {
      if (this.scanInProgress) {
        return;
      }

      this.scanInProgress = true;
      this.scan().catch((error) => {
        this.options.statuses.set("x", "error", `X livechat scan failed: ${String(error)}`);
      }).finally(() => {
        this.scanInProgress = false;
      });
    }, this.options.scanMs);
    this.options.statuses.set("x", "connected", "X livechat browser capture is running.");
  }

  stop() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.cdp?.close();
    this.cdp = null;
    if (this.spawnedChrome) {
      this.chromeProcess?.kill();
    }
    this.chromeProcess = null;
    this.options.statuses.set("x", "disabled", "X livechat browser capture stopped.");
  }

  private async connectToTarget() {
    this.targetOpenRequested = false;
    const target = await this.waitForTarget();
    if (!target.webSocketDebuggerUrl) {
      throw new Error("Chrome target did not expose a DevTools WebSocket URL.");
    }

    this.cdp?.close();
    this.cdp = new CdpClient();
    await this.cdp.connect(target.webSocketDebuggerUrl);
    await this.cdp.send("Runtime.enable");
  }

  private async reconnect() {
    this.options.statuses.set("x", "connecting", "Reconnecting to X livechat capture browser.");
    this.cdp?.close();
    this.cdp = null;
    await this.ensureChrome();
    await this.connectToTarget();
  }

  private async ensureChrome() {
    if (await this.debugEndpointAvailable()) {
      this.spawnedChrome = false;
      return;
    }

    fs.mkdirSync(this.options.userDataDir, { recursive: true });
    this.chromeProcess = spawn(
      this.options.chromePath,
      [
        `--remote-debugging-port=${this.options.debugPort}`,
        `--user-data-dir=${this.options.userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        this.options.targetUrl
      ],
      {
        detached: false,
        stdio: "ignore",
        windowsHide: false
      }
    );
    this.spawnedChrome = true;
  }

  private async debugEndpointAvailable() {
    try {
      const response = await fetch(this.debugUrl("/json/version"));
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitForTarget() {
    const deadline = Date.now() + 30000;
    let lastTargets: CdpTarget[] = [];

    while (Date.now() < deadline) {
      const targets = await this.listTargets().catch(() => []);
      lastTargets = targets;
      const matchingTarget =
        targets.find((target) => target.type === "page" && target.url === this.options.targetUrl) ??
        targets.find((target) => target.type === "page" && target.url.includes("/livechat")) ??
        targets.find((target) => target.type === "page" && target.url.includes("/i/broadcasts/"));

      if (matchingTarget?.webSocketDebuggerUrl) {
        return matchingTarget;
      }

      if (!this.targetOpenRequested && targets.some((target) => target.type === "page")) {
        this.targetOpenRequested = true;
        await this.openTarget();
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Unable to find Chrome page target. Found ${lastTargets.length} target(s).`);
  }

  private async openTarget() {
    try {
      await fetch(this.debugUrl(`/json/new?${encodeURIComponent(this.options.targetUrl)}`), { method: "PUT" });
    } catch {
      // Older Chrome builds may not support /json/new PUT. The initial launch URL is still the primary path.
    }
  }

  private async listTargets() {
    const response = await fetch(this.debugUrl("/json/list"));
    if (!response.ok) {
      throw new Error(`Chrome target lookup failed with ${response.status}.`);
    }
    return (await response.json()) as CdpTarget[];
  }

  private async scan() {
    if (!this.cdp?.isOpen()) {
      await this.reconnect();
    }

    if (!this.cdp?.isOpen()) {
      throw new Error("Chrome DevTools connection is not open.");
    }

    let result: { result?: { value?: unknown } };
    try {
      result = (await this.cdp.send("Runtime.evaluate", {
        expression: X_LIVE_CHAT_SCAN_EXPRESSION,
        returnByValue: true
      })) as { result?: { value?: unknown } };
    } catch (error) {
      this.cdp?.close();
      this.cdp = null;
      throw error;
    }
    const payloads = Array.isArray(result.result?.value) ? result.result.value : [];
    let added = 0;

    for (const payload of payloads) {
      const parsed = payload as { platformMessageId?: string };
      if (!parsed.platformMessageId || this.seenIds.has(parsed.platformMessageId)) {
        continue;
      }

      this.seenIds.add(parsed.platformMessageId);
      if (this.seenIds.size > 1000) {
        this.seenIds.clear();
      }

      if (this.options.publish(normalizeXLiveCaptureMessage({ ...payload, channelName: this.options.channelName }))) {
        added += 1;
      }
    }

    if (added > 0) {
      this.options.statuses.set("x", "connected", `X livechat browser capture received ${added} new message(s).`);
    }
  }

  private debugUrl(pathname: string) {
    return `http://127.0.0.1:${this.options.debugPort}${pathname}`;
  }
}

export function findChromeExecutable(configuredPath: string | null | undefined) {
  const candidates = [
    configuredPath,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge"
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function xLiveChatUrlFromInput(input: string) {
  const trimmed = input.trim();
  if (/^https:\/\/(x|twitter)\.com\//i.test(trimmed)) {
    return trimmed;
  }

  const username = trimmed.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new Error("Provide an X username or X livechat URL.");
  }

  return `https://x.com/${username}/livechat`;
}

export function xLiveChatChannelFromInput(input: string) {
  const trimmed = input.trim();
  const usernameMatch = /^@?([A-Za-z0-9_]{1,15})$/.exec(trimmed);
  if (usernameMatch) {
    return `@${usernameMatch[1]} livechat`;
  }

  try {
    const url = new URL(trimmed);
    const username = url.pathname.split("/").filter(Boolean)[0];
    return username && username !== "i" ? `@${username} livechat` : "X Live Chat";
  } catch {
    return "X Live Chat";
  }
}
