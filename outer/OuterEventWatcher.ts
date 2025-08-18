export interface OuterEvent {
  id: string
  type: string
  payload: Record<string, any>
  timestamp: number
}

type EventHandler = (event: OuterEvent) => void
type ErrorHandler = (err: Error) => void

export class OuterEventWatcher {
  private seen = new Set<string>()
  private intervalId?: NodeJS.Timeout
  private isRunning = false

  constructor(
    private readonly apiUrl: string,
    private readonly pollIntervalMs: number = 20_000
  ) {
    if (!apiUrl || typeof apiUrl !== 'string') {
      throw new Error("apiUrl must be a valid non-empty string")
    }

    if (pollIntervalMs < 1000) {
      throw new RangeError("pollIntervalMs must be at least 1000ms")
    }
  }

  /**
   * Fetch events from API.
   */
  private async fetchEvents(): Promise<OuterEvent[]> {
    const res = await fetch(`${this.apiUrl}/outer/events`)
    if (!res.ok) {
      throw new Error(`Failed to fetch outer events: HTTP ${res.status}`)
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      throw new Error("Invalid response: expected array of events")
    }

    return data as OuterEvent[]
  }

  /**
   * Start polling the event stream.
   */
  start(onEvent: EventHandler, onError?: ErrorHandler): void {
    if (this.isRunning) {
      console.warn("⚠️ OuterEventWatcher is already running.")
      return
    }

    this.isRunning = true

    this.intervalId = setInterval(async () => {
      try {
        const events = await this.fetchEvents()
        for (const evt of events) {
          if (!this.seen.has(evt.id)) {
            this.seen.add(evt.id)
            onEvent(evt)
          }
        }
      } catch (err: any) {
        if (onError) {
          onError(err instanceof Error ? err : new Error(String(err)))
        } else {
          console.error("❌ OuterEventWatcher fetch error:", err)
        }
      }
    }, this.pollIntervalMs)
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
    this.isRunning = false
  }

  /**
   * Reset internal seen-state (for reprocessing or testing).
   */
  reset(): void {
    this.seen.clear()
  }

  /**
   * Check if currently polling.
   */
  isPolling(): boolean {
    return this.isRunning
  }
}
