
import type { BalanceFetcher } from "./BalanceFetcher"

export interface BalanceChange {
  address: string
  oldBalance: number
  newBalance: number
  timestamp: number
}

/**
 * Periodically polls balances for a set of addresses and notifies on change.
 */
export class BalancePoller {
  private last: Map<string, number> = new Map()
  private intervalId?: NodeJS.Timeout

  constructor(
    private fetcher: BalanceFetcher,
    private intervalMs: number = 15_000
  ) {}

  /**
   * Start polling the provided addresses.
   * @param addresses List of wallet addresses
   * @param onChange Callback invoked when a balance changes
   */
  start(
    addresses: string[],
    onChange: (change: BalanceChange) => void
  ): void {
    addresses.forEach(addr => this.last.set(addr, 0))
    this.intervalId = setInterval(async () => {
      for (const addr of addresses) {
        try {
          const newBal = await this.fetcher.fetch(addr)
          const oldBal = this.last.get(addr) ?? 0
          if (newBal !== oldBal) {
            onChange({ address: addr, oldBalance: oldBal, newBalance: newBal, timestamp: Date.now() })
            this.last.set(addr, newBal)
          }
        } catch {
          // ignore per-address errors
        }
      }
    }, this.intervalMs)
  }

  /** Stop polling balances. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }
}
