import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { websocketEnvelopeSchema, type ChatMessage, type Platform, type ViewerSnapshot, type ViewerSource } from "../shared/chat";

type ConnectionState = "connecting" | "connected" | "disconnected";
type StreamSurface = "admin" | "viewer";

const DEFAULT_CLIENT_MESSAGE_LIMIT = 500;
const emptyViewerSnapshot: ViewerSnapshot = {
  sources: [],
  totalKnownViewers: 0,
  unknownSourceCount: 0,
  updatedAt: new Date(0).toISOString()
};

function trimMessages(messages: ChatMessage[], limit: number) {
  return messages.length > limit ? messages.slice(messages.length - limit) : messages;
}

function isDevelopmentSource(source: ViewerSource) {
  return source.channelId === "local-dev-channel" || source.id.startsWith("local-dev:") || source.label.trim().toLowerCase() === "local development";
}

function normalizeViewerSnapshot(snapshot: ViewerSnapshot): ViewerSnapshot {
  const sources = snapshot.sources.filter((source) => !isDevelopmentSource(source));
  return {
    ...snapshot,
    sources,
    totalKnownViewers: sources.reduce((total, source) => total + (source.viewerCount ?? 0), 0),
    unknownSourceCount: sources.filter((source) => source.viewerCount === null).length
  };
}

export function useChatStream(surface: StreamSurface = "admin") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sourceSnapshot, setSourceSnapshot] = useState<ViewerSnapshot>(emptyViewerSnapshot);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const reconnectTimer = useRef<number | null>(null);
  const maxMessages = useRef(DEFAULT_CLIENT_MESSAGE_LIMIT);

  const connect = useCallback(() => {
    setConnectionState("connecting");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws?surface=${surface}`);

    socket.addEventListener("open", () => {
      setConnectionState("connected");
    });

    socket.addEventListener("message", (event) => {
      const parsed = websocketEnvelopeSchema.safeParse(JSON.parse(event.data));

      if (!parsed.success) {
        return;
      }

      if (parsed.data.type === "snapshot") {
        maxMessages.current = parsed.data.maxMessages ?? DEFAULT_CLIENT_MESSAGE_LIMIT;
        setMessages(trimMessages(parsed.data.messages, maxMessages.current));
      }

      if (parsed.data.type === "message") {
        const incoming = parsed.data.message;
        setMessages((current) =>
          trimMessages([...current.filter((message) => message.id !== incoming.id), incoming], maxMessages.current)
        );
      }

      if (parsed.data.type === "sources") {
        setSourceSnapshot(normalizeViewerSnapshot(parsed.data.snapshot));
      }
    });

    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
      reconnectTimer.current = window.setTimeout(connect, 2000);
    });

    socket.addEventListener("error", () => {
      socket.close();
    });

    return socket;
  }, [surface]);

  useEffect(() => {
    const socket = connect();

    return () => {
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
      }
      socket.close();
    };
  }, [connect]);

  const counts = useMemo(() => {
    return messages.reduce(
      (accumulator, message) => {
        accumulator.total += 1;
        accumulator[message.platform] += 1;
        return accumulator;
      },
      { total: 0, twitch: 0, kick: 0, x: 0, marketbubble: 0 } satisfies Record<Platform | "total", number>
    );
  }, [messages]);

  return {
    messages,
    setMessages,
    sourceSnapshot,
    connectionState,
    counts
  };
}
