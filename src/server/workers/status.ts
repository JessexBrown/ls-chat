export type IntegrationState = "disabled" | "connecting" | "connected" | "subscribed" | "error";

export type IntegrationStatus = {
  state: IntegrationState;
  detail: string;
  updatedAt: string;
};

export class IntegrationStatusStore {
  private readonly statuses = new Map<string, IntegrationStatus>();

  set(name: string, state: IntegrationState, detail: string) {
    this.statuses.set(name, {
      state,
      detail,
      updatedAt: new Date().toISOString()
    });
  }

  snapshot() {
    return Object.fromEntries(this.statuses.entries());
  }
}
