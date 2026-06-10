import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { websocketEnvelopeSchema, type ChatMessage, type Platform } from "../shared/chat";

type ConnectionState = "connecting" | "connected" | "disconnected";

const DEFAULT_CLIENT_MESSAGE_LIMIT = 500;

function trimMessages(messages: ChatMessage[], limit: number) {
  return messages.length > limit ? messages.slice(messages.length - limit) : messages;
}

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const reconnectTimer = useRef<number | null>(null);
  const maxMessages = useRef(DEFAULT_CLIENT_MESSAGE_LIMIT);

  const connect = useCallback(() => {
    setConnectionState("connecting");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

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
    });

    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
      reconnectTimer.current = window.setTimeout(connect, 2000);
    });

    socket.addEventListener("error", () => {
      socket.close();
    });

    return socket;
  }, []);

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
      { total: 0, twitch: 0, kick: 0, x: 0 } satisfies Record<Platform | "total", number>
    );
  }, [messages]);

  return {
    messages,
    setMessages,
    connectionState,
    counts
  };
}
