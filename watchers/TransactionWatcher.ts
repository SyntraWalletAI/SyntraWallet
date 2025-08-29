import { EventEmitter } from "events"

export interface TransactionEvent {
  walletAddress: string
  txHash: string
  blockNumber: number
  timestamp: number
}

type RawTx = { hash?: string; block?: number; time?: number }

export interface TransactionWatcherOptions {
  /** Poll interval in milliseconds (default: 15_000) */
  pollIntervalMs?: number
  /** Per-request timeout in milliseconds (default: 7_000) */
  timeoutMs?: number
  /** Retry attempts per request (default: 2). Total tries = retries + 1 */
  retries?: number
  /** Base backoff for retries (ms). Delay = base * attempt^2 (default: 300) */
  backoffMs?: number
  /** Maximum seen tx hashes stored per address to cap memory (default: 5_000) */
  maxSeenPerAddress?: number
  /** Optional headers to include in requests (e.g. User-Agent, API key) */
  headers?: Record<string, string>
  /** Emit self-transactions too (default: true) — kept for parity if explorer returns them */
  includeSelfTx?: boolean
  /** Called when a polling error happens for an address */
  onError?: (address: string, error: Error) => void
}

/**
 * Watches addresses for new transactions via a block explorer API.
 * Emits "tx" for each new tx, "error" on failures, "started"/"stopped" lifecycle events.
 * Also supports add/remove addresses dynamically.
 *
 * Expected explorer endpoint: GET {apiEndpoint}/txs/:address -> Array<{hash, block, time}>
 *  - time is expected in seconds since epoch (common), but both seconds and ms are handled.
 */
export class TransactionWatcher extends EventEmitter {
  private readonly apiEndpoint: string
  private readonly pollIntervalMs: number
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly backoffMs: number
  private readonly maxSeenPerAddress: number
  private readonly headers: Record<string, string>
  private readonly includeSelfTx: boolean
  private readonly onErr?: (address: string, error: Error) => void

  private intervalId?: NodeJS.Timeout
  private ticking = false
  private readonly addresses = new Set<string>()

  // Per-address state with simple LRU for seen hashes
  private readonly seen: Map<string, { set: Set<string>; order: string[]; lastBlock?: number }> = new Map()

  constructor(apiEndpoint: string, opts: TransactionWatcherOptions = {}) {
    super()
    if (!apiEndpoint) throw new Error("apiEndpoint is required")
    this.apiEndpoint = stripTrailingSlash(apiEndpoint)
    this.pollIntervalMs = Math.max(250, opts.pollIntervalMs ?? 15_000)
    this.timeoutMs = Math.max(250, opts.timeoutMs ?? 7_000)
    this.retries = Math.max(0, opts.retries ?? 2)
    this.backoffMs = Math.max(1, opts.backoffMs ?? 300)
    this.maxSeenPerAddress = Math.max(100, opts.maxSeenPerAddress ?? 5_000)
    this.headers = { ...(opts.headers ?? {}) }
    this.includeSelfTx = opts.includeSelfTx ?? true
    this.onErr = opts.onError
  }

  /** Start watching the provided addresses. Subsequent calls are idempotent. */
  start(addresses: string[], onTx?: (event: TransactionEvent) => void): void {
    if (onTx) this.on("tx", onTx)
    addresses.forEach((addr) => this.addAddress(addr))
    if (this.intervalId) return
    // fire immediately, then at interval
    void this.tick()
    this.intervalId = setInterval(() => void this.tick(), this.pollIntervalMs)
    this.emit("started")
  }

  /** Stop watching. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
    this.intervalId = undefined
    this.ticking = false
    this.emit("stopped")
  }

  /** Add an address at runtime. */
  addAddress(address: string): void {
    const key = address.trim()
    if (!key) return
    if (!this.addresses.has(key)) {
      this.addresses.add(key)
      if (!this.seen.has(key)) this.seen.set(key, { set: new Set(), order: [] })
    }
  }

  /** Remove an address and its memory. */
  removeAddress(address: string): void {
    const key = address.trim()
    this.addresses.delete(key)
    this.seen.delete(key)
  }

  /** Return a snapshot status. */
  getStatus(): {
    watching: string[]
    pollIntervalMs: number
    timeoutMs: number
    retries: number
  } {
    return {
      watching: [...this.addresses],
      pollIntervalMs: this.pollIntervalMs,
      timeoutMs: this.timeoutMs,
      retries: this.retries,
    }
  }

  // -------------------- internals --------------------

  private async tick(): Promise<void> {
    if (this.ticking) return // avoid overlapping polls
    this.ticking = true
    try {
      for (const addr of this.addresses) {
        try {
          const txs = await this.fetchWithRetry<RawTx[]>(`${this.apiEndpoint}/txs/${encodeURIComponent(addr)}`)
          const norm = normalizeTxs(txs)
          if (!norm.length) continue

          const state = this.ensureState(addr)
          // Process newest first to reduce latency; assume API returns desc order
          for (const tx of norm) {
            if (state.set.has(tx.hash)) continue
            // Emit and mark seen
            this.emit("tx", {
              walletAddress: addr,
              txHash: tx.hash,
              blockNumber: tx.block,
              timestamp: toMillis(tx.time),
            } as TransactionEvent)
            this.markSeen(state, tx.hash)
            state.lastBlock = state.lastBlock === undefined ? tx.block : Math.max(state.lastBlock, tx.block)
          }
        } catch (e: any) {
          const err = e instanceof Error ? e : new Error(String(e))
          this.emit("error", { address: addr, error: err })
          this.onErr?.(addr, err)
          // continue with other addresses
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private ensureState(addr: string) {
    let s = this.seen.get(addr)
    if (!s) {
      s = { set: new Set<string>(), order: [] }
      this.seen.set(addr, s)
    }
    return s
  }

  private markSeen(state: { set: Set<string>; order: string[] }, hash: string): void {
    state.set.add(hash)
    state.order.push(hash)
    if (state.order.length > this.maxSeenPerAddress) {
      const drop = state.order.shift()
      if (drop) state.set.delete(drop)
    }
  }

  private async fetchWithRetry<T>(url: string): Promise<T> {
    let lastErr: any
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          // Honor Retry-After for 429/5xx
          if (attempt <= this.retries && (res.status === 429 || (res.status >= 500 && res.status <= 599))) {
            const delayMs = computeDelay(this.backoffMs, attempt, res.headers.get("retry-after"))
            await sleep(delayMs)
            continue
          }
          const text = await safeText(res)
          throw new Error(`Explorer API error ${res.status}: ${truncate(text, 180)}`)
        }

        return (await res.json()) as T
      } catch (e: any) {
        clearTimeout(timer)
        const isAbort = e?.name === "AbortError"
        lastErr = isAbort ? new Error(`Timeout after ${this.timeoutMs}ms`) : e
        if (attempt <= this.retries && !isAbort) {
          const delayMs = this.backoffMs * attempt * attempt + Math.floor(Math.random() * 100)
          await sleep(delayMs)
          continue
        }
        break
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }
}

/* -------------------- helpers -------------------- */

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s
}

function toMillis(t: number): number {
  // Accept seconds or milliseconds
  return t > 1e12 ? t : Math.round(t * 1000)
}

function normalizeTxs(raw: RawTx[] | unknown): Array<{ hash: string; block: number; time: number }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ hash: string; block: number; time: number }> = []
  for (const r of raw) {
    const hash = typeof r?.hash === "string" ? r.hash : ""
    const block = Number((r as any)?.block)
    const time = Number((r as any)?.time)
    if (!hash || !Number.isFinite(block) || !Number.isFinite(time)) continue
    out.push({ hash, block, time })
  }
  return out
}

function computeDelay(base: number, attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const asNum = Number(retryAfterHeader)
    if (Number.isFinite(asNum)) return Math.max(0, Math.round(asNum * 1000))
    const asDate = Date.parse(retryAfterHeader)
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
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
