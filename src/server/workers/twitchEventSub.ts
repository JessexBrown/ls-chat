import WebSocket from "ws";
import { normalizeTwitchChatMessage } from "../adapters/twitch";
import type { ChatMessage } from "../../shared/chat";
import type { IntegrationStatusStore } from "./status";

type PublishMessage = (message: ChatMessage | null) => void;

type TwitchEventSubWorkerOptions = {
  clientId: string;
  userAccessToken: string;
  broadcasterUserIds: string[];
  userId: string;
  publish: PublishMessage;
  statuses: IntegrationStatusStore;
};

type TwitchEventSubEnvelope = {
  metadata?: {
    message_type?: string;
  };
  payload?: {
    session?: {
      id?: string;
      reconnect_url?: string | null;
    };
  };
};

const TWITCH_EVENTSUB_SOCKET_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

export class TwitchEventSubWorker {
  private readonly options: TwitchEventSubWorkerOptions;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private intentionallyReconnecting = false;
  private stopped = true;

  constructor(options: TwitchEventSubWorkerOptions) {
    this.options = options;
  }

  start(url = TWITCH_EVENTSUB_SOCKET_URL) {
    this.stopped = false;
    this.clearReconnectTimer();
    this.options.statuses.set("twitch", "connecting", "Connecting to Twitch EventSub WebSocket.");
    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.options.statuses.set("twitch", "connected", "Connected; waiting for Twitch session welcome.");
    });

    this.socket.on("message", (data) => {
      this.handleMessage(data.toString()).catch((error) => {
        this.options.statuses.set("twitch", "error", `Failed to handle Twitch EventSub message: ${String(error)}`);
      });
    });

    this.socket.on("close", () => {
      this.socket = null;
      if (!this.stopped && !this.intentionallyReconnecting) {
        this.scheduleReconnect();
      }
      this.intentionallyReconnecting = false;
    });

    this.socket.on("error", (error) => {
      this.options.statuses.set("twitch", "error", `Twitch EventSub socket error: ${error.message}`);
    });
  }

  stop() {
    this.stopped = true;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.options.statuses.set("twitch", "disabled", "Twitch EventSub worker stopped.");
  }

  private async handleMessage(rawMessage: string) {
    const envelope = JSON.parse(rawMessage) as TwitchEventSubEnvelope;
    const messageType = envelope.metadata?.message_type;

    if (messageType === "session_welcome") {
      const sessionId = envelope.payload?.session?.id;
      if (!sessionId) {
        throw new Error("Twitch welcome message did not include a session id.");
      }

      await this.createChatSubscriptions(sessionId);
      return;
    }

    if (messageType === "notification") {
      this.options.publish(normalizeTwitchChatMessage(envelope.payload));
      return;
    }

    if (messageType === "session_reconnect") {
      const reconnectUrl = envelope.payload?.session?.reconnect_url;
      if (reconnectUrl) {
        this.intentionallyReconnecting = true;
        this.start(reconnectUrl);
      }
      return;
    }

    if (messageType === "revocation") {
      this.options.statuses.set("twitch", "error", "Twitch revoked the chat EventSub subscription.");
    }
  }

  private async createChatSubscriptions(sessionId: string) {
    for (const broadcasterUserId of this.options.broadcasterUserIds) {
      const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.userAccessToken}`,
          "Client-Id": this.options.clientId,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: broadcasterUserId,
            user_id: this.options.userId
          },
          transport: {
            method: "websocket",
            session_id: sessionId
          }
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Twitch subscription failed for ${broadcasterUserId} with ${response.status}: ${body}`);
      }
    }

    this.options.statuses.set(
      "twitch",
      "subscribed",
      `Subscribed to Twitch channel.chat.message for ${this.options.broadcasterUserIds.length} broadcaster(s).`
    );
  }

  private scheduleReconnect() {
    const delayMs = Math.min(30000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.options.statuses.set("twitch", "connecting", `Reconnecting to Twitch in ${delayMs / 1000}s.`);
    this.reconnectTimer = setTimeout(() => this.start(), delayMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
