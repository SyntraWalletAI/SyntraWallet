
export interface OuterEvent {
  id: string
  type: string
  payload: Record<string, any>
  timestamp: number
}

export class OuterEventWatcher {
  private seen = new Set<string>()
  private intervalId?: NodeJS.Timeout

  constructor(
    private apiUrl: string,
    private pollIntervalMs: number = 20_000
  ) {}

  private async fetchEvents(): Promise<OuterEvent[]> {
    const res = await fetch(`${this.apiUrl}/outer/events`)
    if (!res.ok) {
      throw new Error(`Failed to fetch outer events: ${res.status}`)
    }
    return (await res.json()) as OuterEvent[]
  }

  /**
   * Start watching for outer events. Calls onEvent for each new event.
   */
  start(onEvent: (evt: OuterEvent) => void): void {
    this.intervalId = setInterval(async () => {
      try {
        const events = await this.fetchEvents()
        for (const e of events) {
          if (!this.seen.has(e.id)) {
            this.seen.add(e.id)
            onEvent(e)
          }
        }
      } catch {
        // silently ignore
      }
    }, this.pollIntervalMs)
  }

  /** Stop watching for events. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}