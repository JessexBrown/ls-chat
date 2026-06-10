import type { ChatMessage } from "../shared/chat";

type MessageListener = (message: ChatMessage) => void;

export class ChatHub {
  private readonly maxMessages: number;
  private readonly messages: ChatMessage[] = [];
  private readonly listeners = new Set<MessageListener>();
  private readonly seenIds = new Set<string>();

  constructor(maxMessages = 500) {
    this.maxMessages = maxMessages;
  }

  add(message: ChatMessage) {
    if (this.seenIds.has(message.id)) {
      return false;
    }

    this.messages.push(message);
    this.seenIds.add(message.id);

    while (this.messages.length > this.maxMessages) {
      const removed = this.messages.shift();
      if (removed) {
        this.seenIds.delete(removed.id);
      }
    }

    for (const listener of this.listeners) {
      listener(message);
    }

    return true;
  }

  snapshot() {
    return [...this.messages];
  }

  subscribe(listener: MessageListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get size() {
    return this.messages.length;
  }
}
