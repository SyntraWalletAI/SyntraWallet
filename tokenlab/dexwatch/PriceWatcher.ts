
import type { PricePoint } from "./MarketDataFetcher"

export interface PriceAlert {
  symbol: string
  oldPrice: number
  newPrice: number
  changePct: number
  timestamp: number
}

export type AlertCallback = (alert: PriceAlert) => void

/**
 * Watches price movements for one or more symbols and triggers alerts.
 */
export class PriceWatcher {
  private lastPrices = new Map<string, number>()
  private intervalId?: NodeJS.Timeout

  /**
   * @param fetcher Instance of MarketDataFetcher
   * @param symbols Symbols to watch
   * @param thresholdPct Percentage change threshold to alert (e.g. 2 = 2%)
   * @param pollIntervalMs Polling interval in ms
   */
  constructor(
    private fetcher: { fetchPrice(symbol: string): Promise<PricePoint> },
    private symbols: string[],
    private thresholdPct: number = 1,
    private pollIntervalMs: number = 15_000
  ) {}

  /**
   * Start polling prices and invoke callback on significant change.
   */
  start(onAlert: AlertCallback): void {
    this.symbols.forEach(sym => this.lastPrices.set(sym, 0))

    this.intervalId = setInterval(async () => {
      for (const sym of this.symbols) {
        try {
          const { price, timestamp } = await this.fetcher.fetchPrice(sym)
          const old = this.lastPrices.get(sym) ?? price
          const change = old > 0 ? ((price - old) / old) * 100 : 0
          if (Math.abs(change) >= this.thresholdPct) {
            onAlert({ symbol: sym, oldPrice: old, newPrice: price, changePct: change, timestamp })
            this.lastPrices.set(sym, price)
          }
        } catch {
          // ignore individual errors
        }
      }
    }, this.pollIntervalMs)
  }

  /** Stop watching prices. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}