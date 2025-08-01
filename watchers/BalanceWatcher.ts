import fetch from "node-fetch"
import EventEmitter from "events"
import pLimit from "p-limit"
import { z } from "zod"

export interface BalanceChange {
  walletAddress: string
  oldBalance: number
  newBalance: number
  timestamp: number
}

/**
 * Options for BalanceWatcher
 */
export interface BalanceWatcherOptions {
  /** Poll interval in ms (default: 15_000) */
  pollIntervalMs?: number
  /** Max concurrent RPC calls (default: 5) */
  concurrency?: number
  /** RPC JSON-RPC method name (default: "getBalance") */
  method?: string
}

/**
 * Polls a JSON-RPC endpoint for wallets’ balances and emits changes.
 * 
 * Events:
 *  - "change": BalanceChange
 *  - "error": { walletAddress: string; error: string }
 */
export class BalanceWatcher extends EventEmitter {
  private lastBalances = new Map<string, number>()
  private intervalId?: NodeJS.Timeout
  private readonly pollIntervalMs: number
  private readonly concurrency: number
  private readonly method: string

  constructor(
    private rpcEndpoint: string,
    opts: BalanceWatcherOptions = {}
  ) {
    super()
    this.pollIntervalMs = opts.pollIntervalMs ?? 15_000
    this.concurrency = opts.concurrency ?? 5
    this.method = opts.method ?? "getBalance"

    if (!this.rpcEndpoint) {
      throw new Error("rpcEndpoint is required")
    }
    if (this.pollIntervalMs < 1000) {
      throw new RangeError("pollIntervalMs must be at least 1000ms")
    }
    if (this.concurrency < 1 || !Number.isInteger(this.concurrency)) {
      throw new RangeError("concurrency must be a positive integer")
    }
  }

  private async fetchBalance(address: string): Promise<number> {
    const payload = {
      jsonrpc: "2.0",
      method: this.method,
      params: [address],
      id: Date.now(),
    }
    const res = await fetch(this.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      throw new Error(`RPC error ${res.status}`)
    }
    const parsed = await res.json()
    // support both numeric result or { value }
    const result = parsed.result
    if (typeof result === "number") return result
    if (typeof result?.value === "number") return result.value
    throw new Error("Unexpected RPC response format")
  }

  /**
   * Start watching the given addresses.
   * Emits "change" and "error" events.
   */
  public start(addresses: string[]): void {
    // Validate addresses
    const AddrSchema = z.string().min(32)
    addresses.forEach(addr => AddrSchema.parse(addr))

    // initialize balances
    addresses.forEach(addr => this.lastBalances.set(addr, NaN))

    const limit = pLimit(this.concurrency)

    this.intervalId = setInterval(() => {
      addresses.forEach(addr => {
        limit(async () => {
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
            this.emit("error", { walletAddress: addr, error: err.message })
          }
        })
      })
    }, this.pollIntervalMs)
  }

  /** Stop polling balances. */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }
}
