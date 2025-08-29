import { EventEmitter } from "events"

export interface OuterEvent {
  id: string
  type: string
  payload: Record<string, any>
  timestamp: number
}

type EventHandler = (event: OuterEvent) => void
type ErrorHandler = (err: Error) => void

export interface OuterEventWatcherOptions {
  /** Poll interval in ms (default: 20_000, min: 1_000) */
  pollIntervalMs?: number
  /** Per-request timeout in ms (default: 7_000) */
  timeoutMs?: number
  /** Retry attempts per request (default: 2). Total tries = retries + 1 */
  retries?: number
  /** Base backoff delay for retries (attempt^2 * base) in ms (default: 300) */
  backoffMs?: number
  /** Optional static headers (API key, UA, etc.) */
  headers?: Record<string, string>
  /** Cap the number of remembered event IDs per watcher to bound memory (default: 5_000) */
  maxSeenIds?: number
  /** Start by fetching only events newer than now (skip historical) (default: true) */
  skipBackfillOnFirstRun?: boolean
  /** Emit an event immediately on start (no wait for the first interval) (default: true) */
  immediateFirstTick?: boolean
  /** Append a `since` query with last timestamp to reduce payloads (default: true) */
  useSinceQuery?: boolean
}

/**
 * Watches an API endpoint for new events, with retries, timeouts, id de-duplication,
 * optional `since` cursor, and both callback & EventEmitter interfaces.
 *
 * Expected endpoint: GET {apiUrl}/outer/events[?since=<unix_ms>]
 * Response: Array<{ id: string, type: string, payload: object, timestamp: number }>
 */
export class OuterEventWatcher extends EventEmitter {
  private readonly apiUrl: string
  private readonly pollIntervalMs: number
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly backoffMs: number
  private readonly headers: Record<string, string>
  private readonly maxSeenIds: number
  private readonly skipBackfillOnFirstRun: boolean
  private readonly immediateFirstTick: boolean
  private readonly useSinceQuery: boolean

  private seen = new Set<string>()
  private order: string[] = [] // simple LRU for seen ids
  private intervalId?: NodeJS.Timeout
  private isRunning = false
  private ticking = false
  private lastTimestamp: number | undefined

  constructor(apiUrl: string, opts: OuterEventWatcherOptions = {}) {
    super()
    if (!apiUrl || typeof apiUrl !== "string") {
      throw new Error("apiUrl must be a valid non-empty string")
    }
    if (opts.pollIntervalMs !== undefined && opts.pollIntervalMs < 1000) {
      throw new RangeError("pollIntervalMs must be at least 1000ms")
    }

    this.apiUrl = stripTrailingSlash(apiUrl)
    this.pollIntervalMs = opts.pollIntervalMs ?? 20_000
    this.timeoutMs = Math.max(250, opts.timeoutMs ?? 7_000)
    this.retries = Math.max(0, opts.retries ?? 2)
    this.backoffMs = Math.max(1, opts.backoffMs ?? 300)
    this.headers = { ...(opts.headers ?? {}) }
    this.maxSeenIds = Math.max(100, opts.maxSeenIds ?? 5_000)
    this.skipBackfillOnFirstRun = opts.skipBackfillOnFirstRun ?? true
    this.immediateFirstTick = opts.immediateFirstTick ?? true
    this.useSinceQuery = opts.useSinceQuery ?? true
  }

  /**
   * Start polling the event stream.
   * You can subscribe via callback or by listening to "event" / "error" on the instance.
   */
  start(onEvent?: EventHandler, onError?: ErrorHandler): void {
    if (this.isRunning) {
      console.warn("OuterEventWatcher is already running.")
      return
    }
    if (onEvent) this.on("event", onEvent)
    if (onError) this.on("error", onError)

    // Initialize cursor: if skipping backfill, set to "now" so we only get new events
    if (this.skipBackfillOnFirstRun && this.lastTimestamp === undefined) {
      this.lastTimestamp = Date.now()
    }

    this.isRunning = true

    const run = () => void this.tick().catch((e) => this.emit("error", toError(e)))
    if (this.immediateFirstTick) run()
    this.intervalId = setInterval(run, this.pollIntervalMs)
  }

  /** Stop polling. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
    this.intervalId = undefined
    this.isRunning = false
    this.ticking = false
  }

  /** Reset internal state (forget seen ids and cursor). */
  reset(): void {
    this.seen.clear()
    this.order = []
    this.lastTimestamp = undefined
  }

  /** Check if currently polling. */
  isPolling(): boolean {
    return this.isRunning
  }

  /** Manually set the `since` cursor (in ms). Useful to resume from a known point. */
  setSince(timestampMs: number | undefined): void {
    this.lastTimestamp = typeof timestampMs === "number" ? Math.max(0, timestampMs) : undefined
  }

  // -------------------- internals --------------------

  private async tick(): Promise<void> {
    if (!this.isRunning || this.ticking) return
    this.ticking = true
    try {
      const events = await this.fetchEvents(this.lastTimestamp)
      // Sort by timestamp asc to process in order
      events.sort((a, b) => a.timestamp - b.timestamp)
      for (const evt of events) {
        // Deduplicate by id
        if (this.seen.has(evt.id)) continue
        this.markSeen(evt.id)
        this.emit("event", evt)
        // Advance cursor
        if (this.lastTimestamp === undefined || evt.timestamp > this.lastTimestamp) {
          this.lastTimestamp = evt.timestamp
        }
      }
    } catch (e) {
      this.emit("error", toError(e))
    } finally {
      this.ticking = false
    }
  }

  private async fetchEvents(since?: number): Promise<OuterEvent[]> {
    const url =
      this.useSinceQuery && typeof since === "number"
        ? `${this.apiUrl}/outer/events?since=${encodeURIComponent(String(since))}`
        : `${this.apiUrl}/outer/events`

    const data = await this.getWithRetry(url)
    if (!Array.isArray(data)) throw new Error("Invalid response: expected array of events")

    const out: OuterEvent[] = []
    for (const item of data) {
      const evt = sanitizeEvent(item)
      if (evt) out.push(evt)
    }
    return out
  }

  private async getWithRetry(url: string): Promise<any> {
    let lastErr: any
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, { headers: this.headers, signal: controller.signal })
        clearTimeout(timer)

        if (!res.ok) {
          // Retry on 408, 429, and 5xx
          if (attempt <= this.retries && (res.status === 408 || res.status === 429 || (res.status >= 500 && res.status <= 599))) {
            const delay = computeRetryDelay(this.backoffMs, attempt, res.headers.get("retry-after"))
            await sleep(delay)
            continue
          }
          const text = await safeText(res)
          throw new Error(`HTTP ${res.status}: ${truncate(text, 200)}`)
        }

        return await res.json()
      } catch (e: any) {
        clearTimeout(timer)
        const isAbort = e?.name === "AbortError"
        lastErr = isAbort ? new Error(`Timeout after ${this.timeoutMs}ms`) : e
        if (attempt <= this.retries && !isAbort) {
          const delay = this.backoffMs * attempt * attempt + Math.floor(Math.random() * 100)
          await sleep(delay)
          continue
        }
        break
      }
    }
    throw toError(lastErr)
  }

  private markSeen(id: string): void {
    this.seen.add(id)
    this.order.push(id)
    if (this.order.length > this.maxSeenIds) {
      const drop = this.order.shift()
      if (drop) this.seen.delete(drop)
    }
  }
}

/* -------------------- helpers -------------------- */

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

function sanitizeEvent(x: any): OuterEvent | null {
  if (
    x &&
    typeof x.id === "string" &&
    typeof x.type === "string" &&
    typeof x.timestamp === "number" &&
    Number.isFinite(x.timestamp)
  ) {
    const payload = typeof x.payload === "object" && x.payload != null ? x.payload : {}
    return {
      id: x.id,
      type: x.type,
      payload,
      timestamp: x.timestamp > 1e12 ? x.timestamp : Math.round(x.timestamp * 1000), // allow seconds or ms
    }
  }
  return null
}

function computeRetryDelay(base: number, attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const n = Number(retryAfterHeader)
    if (Number.isFinite(n)) return Math.max(0, Math.round(n * 1000))
    const dt = Date.parse(retryAfterHeader)
    if (!Number.isNaN(dt)) return Math.max(0, dt - Date.now())
  }
  const backoff = base * attempt * attempt
  const jitter = Math.floor(Math.random() * 200)
  return backoff + jitter
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…"
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)))
}
