import fetch, { RequestInit } from "node-fetch"
import EventEmitter from "events"
import pLimit from "p-limit"
import { z } from "zod"

/** Change event payload */
export interface BalanceChange {
  walletAddress: string
  oldBalance: number
  newBalance: number
  timestamp: number
}

/** Options for BalanceWatcher */
export interface BalanceWatcherOptions {
  /** Poll interval in ms (default: 15_000) */
  pollIntervalMs?: number
  /** Max concurrent RPC calls (default: 5) */
  concurrency?: number
  /** RPC JSON-RPC method name (default: "getBalance") */
  method?: string
  /** Per-request timeout in ms (default: 10_000) */
  timeoutMs?: number
  /** Retries per request on network error (default: 2) */
  retries?: number
  /** Linear backoff delay between retries in ms (default: 300) */
  backoffMs?: number
  /** If true, run an immediate poll on start before scheduling interval (default: true) */
  runImmediate?: boolean
  /**
   * Optional params builder: given an address, return the JSON-RPC params array
   * Default: [address]
   */
  rpcParamsBuilder?: (address: string) => any[]
}

/** Internal JSON-RPC envelope */
type JsonRpcRequest = { jsonrpc: "2.0"; method: string; params: any[]; id: number }
type JsonRpcSuccess = { jsonrpc: "2.0"; id: number; result: unknown }
type JsonRpcError = { jsonrpc: "2.0"; id: number; error: { code: number; message: string; data?: unknown } }
type JsonRpcResponse = JsonRpcSuccess | JsonRpcError

/** Typed events */
type WatcherEvents = {
  change: (payload: BalanceChange) => void
  error: (data: { walletAddress: string; error: string }) => void
  start: (addresses: string[]) => void
  stop: () => void
  tick: (ts: number) => void
}

/**
 * Polls a JSON-RPC endpoint for wallets’ balances and emits changes
 *
 * Events:
 *  - "change": BalanceChange
 *  - "error": { walletAddress: string; error: string }
 *  - "start": string[]
 *  - "stop": void
 *  - "tick": number
 */
export class BalanceWatcher extends EventEmitter {
  private readonly rpcEndpoint: string
  private readonly pollIntervalMs: number
  private readonly concurrency: number
  private readonly method: string
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly backoffMs: number
  private readonly runImmediate: boolean
  private readonly rpcParamsBuilder: (address: string) => any[]

  private lastBalances = new Map<string, number>()
  private intervalId?: NodeJS.Timeout
  private limiter: ReturnType<typeof pLimit>
  private running = false
  private addresses: string[] = []

  constructor(rpcEndpoint: string, opts: BalanceWatcherOptions = {}) {
    super()
    this.rpcEndpoint = String(rpcEndpoint || "")
    this.pollIntervalMs = numberOrDefault(opts.pollIntervalMs, 15_000, 1_000)
    this.concurrency = intOrDefault(opts.concurrency, 5, 1)
    this.method = String(opts.method || "getBalance")
    this.timeoutMs = numberOrDefault(opts.timeoutMs, 10_000, 1)
    this.retries = intOrDefault(opts.retries, 2, 0)
    this.backoffMs = numberOrDefault(opts.backoffMs, 300, 0)
    this.runImmediate = opts.runImmediate !== false
    this.rpcParamsBuilder = opts.rpcParamsBuilder ?? ((address: string) => [address])

    if (!this.rpcEndpoint) throw new Error("rpcEndpoint is required")

    this.limiter = pLimit(this.concurrency)
  }

  /** Typed 'on' */
  public on<E extends keyof WatcherEvents>(event: E, listener: WatcherEvents[E]): this {
    return super.on(event, listener)
  }

  /** Typed 'once' */
  public once<E extends keyof WatcherEvents>(event: E, listener: WatcherEvents[E]): this {
    return super.once(event, listener)
  }

  /** Validate and set addresses to watch (resets internal cache for new ones) */
  public setAddresses(addresses: string[]): void {
    const schema = z
      .array(
        z
          .string()
          .min(32, "address too short")
          .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "address must be base58-like")
      )
      .min(1, "addresses required")

    const valid = schema.parse(addresses)
    this.addresses = Array.from(new Set(valid))
    // initialize balances for new addresses only; keep existing values for continuity
    for (const addr of this.addresses) {
      if (!this.lastBalances.has(addr)) this.lastBalances.set(addr, NaN)
    }
    // prune removed addresses
    for (const addr of Array.from(this.lastBalances.keys())) {
      if (!this.addresses.includes(addr)) this.lastBalances.delete(addr)
    }
  }

  /** Start watching the current addresses */
  public start(): void {
    if (this.running) return
    if (this.addresses.length === 0) throw new Error("No addresses set. Call setAddresses([...]) first")
    this.running = true
    this.emit("start", this.addresses.slice())
    if (this.runImmediate) {
      void this.pollOnce()
    }
    this.intervalId = setInterval(() => void this.pollOnce(), this.pollIntervalMs)
  }

  /** Stop polling balances */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
    this.running = false
    this.emit("stop")
  }

  /** Get last known balance (or NaN if not yet fetched) */
  public getLastBalance(address: string): number {
    return this.lastBalances.get(address) ?? NaN
  }

  /** Stats about current run */
  public getStatus(): {
    running: boolean
    addresses: number
    concurrency: number
    intervalMs: number
    endpoint: string
  } {
    return {
      running: this.running,
      addresses: this.addresses.length,
      concurrency: this.concurrency,
      intervalMs: this.pollIntervalMs,
      endpoint: this.rpcEndpoint,
    }
  }

  // -------------------- internals --------------------

  private async pollOnce(): Promise<void> {
    const ts = Date.now()
    this.emit("tick", ts)
    const tasks = this.addresses.map((addr) =>
      this.limiter(() => this.pollAddress(addr))
    )
    await Promise.all(tasks)
  }

  private async pollAddress(addr: string): Promise<void> {
    try {
      const newBal = await this.fetchBalance(addr)
      const oldBal = this.lastBalances.get(addr)!
      if (oldBal !== newBal) {
        const change: BalanceChange = {
          walletAddress: addr,
          oldBalance: isNaN(oldBal) ? newBal : oldBal,
          newBalance: newBal,
          timestamp: Date.now(),
        }
        this.lastBalances.set(addr, newBal)
        this.emit("change", change)
      }
    } catch (err: any) {
      this.emit("error", { walletAddress: addr, error: err?.message ?? String(err) })
    }
  }

  private async fetchBalance(address: string): Promise<number> {
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: this.method,
      params: this.rpcParamsBuilder(address),
      id: Date.now(),
    }
    const res = await this.fetchJson(this.rpcEndpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", accept: "application/json" },
    })
    // JSON-RPC error
    if ("error" in res && res.error) {
      const e = res.error
      throw new Error(`RPC ${e.code}: ${e.message}`)
    }
    const result = (res as JsonRpcSuccess).result
    if (typeof result === "number") return result
    // support both { value } and { context, value }
    // e.g., Solana getBalance returns { value: number }
    if (typeof (result as any)?.value === "number") return (result as any).value
    throw new Error("Unexpected RPC response format")
  }

  private async fetchJson(url: string, init: RequestInit): Promise<JsonRpcResponse> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await fetch(url, { ...init, signal: controller.signal })
        clearTimeout(timer)
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`)
        }
        return (await res.json()) as JsonRpcResponse
      } catch (err) {
        clearTimeout(timer)
        lastErr = err
        if (attempt < this.retries) {
          await delay(this.backoffMs)
          continue
        }
        break
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }
}

/* -------------------- helpers -------------------- */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function numberOrDefault(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
      ? Number(v)
      : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function intOrDefault(v: unknown, fallback: number, min = 0): number {
  const n = numberOrDefault(v, fallback, min)
  return Math.max(min, Math.trunc(n))
}

/*
filename options
- balance_watcher.ts
- balance_watcher_service.ts
- balance_watcher_runner.ts
*/
