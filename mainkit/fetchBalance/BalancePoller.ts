import type { BalanceFetcher } from "./BalanceFetcher"

export interface BalanceChange {
  address: string
  oldBalance: number
  newBalance: number
  timestamp: number
}

export class BalancePoller {
  private readonly last: Map<string, number> = new Map()
  private intervalId?: NodeJS.Timeout
  private isPolling = false

  constructor(
    private readonly fetcher: BalanceFetcher,
    private readonly intervalMs: number = 15_000
  ) {
    if (intervalMs < 1_000) {
      throw new RangeError("intervalMs must be at least 1000ms")
    }
  }

  /**
   * Start polling the provided addresses for balance changes.
   */
  start(addresses: string[], onChange: (change: BalanceChange) => void): void {
    if (this.isPolling) {
      console.warn("BalancePoller is already running.")
      return
    }

    this.isPolling = true
    addresses.forEach(addr => this.last.set(addr, this.last.get(addr) ?? 0))

    this.intervalId = setInterval(async () => {
      const tasks = addresses.map(async (addr) => {
        try {
          const newBal = await this.fetcher.fetch(addr)
          const oldBal = this.last.get(addr) ?? 0
          if (newBal !== oldBal) {
            onChange({
              address: addr,
              oldBalance: oldBal,
              newBalance: newBal,
              timestamp: Date.now(),
            })
            this.last.set(addr, newBal)
          }
        } catch (err) {
          console.warn(`⚠️ Failed to fetch balance for ${addr}:`, err)
        }
      })

      await Promise.allSettled(tasks)
    }, this.intervalMs)
  }

  /**
   * Stop the balance polling.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
      this.isPolling = false
    }
  }

  /**
   * Clear all tracked balances.
   */
  reset(): void {
    this.last.clear()
  }

  /**
   * Get the last known balances for all tracked addresses.
   */
  getLastBalances(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [addr, balance] of this.last.entries()) {
      result[addr] = balance
    }
    return result
  }
}
