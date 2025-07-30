// BalanceService.ts

interface BalanceServiceHooks {
  onFetchStart?: (address: string) => void
  onFetchSuccess?: (address: string, balance: number) => void
  onFetchError?: (address: string, error: Error) => void
}

export interface BalanceServiceOptions {
  cacheTtlMs?: number
  retries?: number
  backoffMs?: number
  hooks?: BalanceServiceHooks
}

/** Simple structured logger */
const logger = {
  info: (msg: string, meta: any = {}) =>
    console.log({ level: "info", timestamp: new Date().toISOString(), msg, ...meta }),
  warn: (msg: string, meta: any = {}) =>
    console.warn({ level: "warn", timestamp: new Date().toISOString(), msg, ...meta }),
  error: (msg: string, meta: any = {}) =>
    console.error({ level: "error", timestamp: new Date().toISOString(), msg, ...meta }),
}

/**
 * Service to fetch and cache on‑chain balances with TTL, retries, and hooks.
 */
export class BalanceService {
  private cache = new Map<string, { balance: number; fetchedAt: number }>()
  private inFlight = new Map<string, Promise<number>>()
  private cacheTtlMs: number
  private retries: number
  private backoffMs: number
  private hooks: Required<BalanceServiceHooks>

  constructor(
    private rpcEndpoint: string,
    opts: BalanceServiceOptions = {}
  ) {
    this.cacheTtlMs = opts.cacheTtlMs ?? 60_000
    this.retries = opts.retries ?? 2
    this.backoffMs = opts.backoffMs ?? 500
    this.hooks = {
      onFetchStart: opts.hooks?.onFetchStart ?? (() => {}),
      onFetchSuccess: opts.hooks?.onFetchSuccess ?? (() => {}),
      onFetchError: opts.hooks?.onFetchError ?? (() => {}),
    }
  }

  /** Manually clear cache entry (or all if omitted) */
  public clearCache(address?: string): void {
    if (address) {
      this.cache.delete(address)
      logger.info("Cache cleared for address", { address })
    } else {
      this.cache.clear()
      logger.info("All cache entries cleared")
    }
  }

  /** Get wallet balance, using cache if within TTL, deduplicating in‐flight fetches */
  public async getBalance(address: string): Promise<number> {
    const now = Date.now()
    const entry = this.cache.get(address)
    if (entry && now - entry.fetchedAt < this.cacheTtlMs) {
      logger.info("Returning cached balance", { address, balance: entry.balance })
      return entry.balance
    }
    if (this.inFlight.has(address)) {
      logger.info("Awaiting in-flight fetch", { address })
      return this.inFlight.get(address)!
    }
    const promise = this.fetchWithRetries(address)
      .then((bal) => {
        this.cache.set(address, { balance: bal, fetchedAt: Date.now() })
        return bal
      })
      .finally(() => {
        this.inFlight.delete(address)
      })
    this.inFlight.set(address, promise)
    return promise
  }

  /** Internal: fetch balance with retry/backoff logic */
  private async fetchWithRetries(address: string): Promise<number> {
    this.hooks.onFetchStart(address)
    logger.info("Fetching balance on-chain", { address })
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      try {
        const balance = await this.fetchBalanceOnChain(address)
        this.hooks.onFetchSuccess(address, balance)
        logger.info("Fetched balance", { address, balance, attempt })
        return balance
      } catch (err: any) {
        logger.warn("Fetch attempt failed", { address, attempt, error: err.message })
        this.hooks.onFetchError(address, err)
        if (attempt <= this.retries) {
          await this.delay(this.backoffMs * attempt)
          continue
        }
        logger.error("All fetch attempts failed", { address })
        throw err
      }
    }
    throw new Error("BalanceService: unexpected retry exit")
  }

  /** Internal: perform the RPC call */
  private async fetchBalanceOnChain(address: string): Promise<number> {
    const res = await fetch(this.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getBalance",
        params: [address],
        id: 1,
      }),
    })
    if (!res.ok) throw new Error(`RPC error ${res.status}`)
    const json = await res.json()
    const result = json.result
    return typeof result === "number" ? result : result.value
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
