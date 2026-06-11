import type { ChatMessage } from "../shared/chat";

type MessageListener = (message: ChatMessage) => void;

export class ChatHub {
  private maxMessages: number;
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

  remove(id: string) {
    const index = this.messages.findIndex((message) => message.id === id);
    if (index === -1) {
      return null;
    }

    const [removed] = this.messages.splice(index, 1);
    this.seenIds.delete(removed.id);
    return removed;
  }

  setMaxMessages(maxMessages: number) {
    this.maxMessages = maxMessages;

    while (this.messages.length > this.maxMessages) {
      const removed = this.messages.shift();
      if (removed) {
        this.seenIds.delete(removed.id);
      }
    }
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
