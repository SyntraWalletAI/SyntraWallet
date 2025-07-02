

import type { Trade } from "./TradeFetcher"
import type { TradeStats } from "./TradeAnalyzer"

export class TradeReporter {

  static summarize(symbol: string, stats: TradeStats): string {
    return [
      `Symbol: ${symbol}`,
      `Total Volume: ${stats.totalVolume.toFixed(2)}`,
      `VWAP: ${stats.vwap.toFixed(4)}`,
      `Average Trade Size: ${stats.averageSize.toFixed(4)}`,
      `Buys: ${stats.buyCount}, Sells: ${stats.sellCount}`,
    ].join(" | ")
  }

  /**
   * Create a simple table of the most recent `n` trades.
   */
  static table(trades: Trade[], n: number = 10): string {
    const header = `Time\t\tPrice\tSize\tSide`
    const rows = trades.slice(0, n).map(t => {
      const time = new Date(t.timestamp).toLocaleTimeString()
      return `${time}\t${t.price.toFixed(4)}\t${t.size.toFixed(4)}\t${t.side}`
    })
    return [header, ...rows].join("\n")
  }
}
