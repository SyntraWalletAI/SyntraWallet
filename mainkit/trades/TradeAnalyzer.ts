// trades/TradeAnalyzer.ts

import type { Trade } from "./TradeFetcher"

export interface TradeStats {
  totalVolume: number
  vwap: number
  averageSize: number
  buyCount: number
  sellCount: number
}

/**
 * Analyze an array of trades to compute summary statistics.
 */
export class TradeAnalyzer {
  constructor(private trades: Trade[]) {}

  computeStats(): TradeStats {
    let pvSum = 0
    let volSum = 0
    let sizeSum = 0
    let buyCount = 0
    let sellCount = 0

    for (const t of this.trades) {
      pvSum += t.price * t.size
      volSum += t.size
      sizeSum += t.size
      if (t.side === "buy") buyCount++
      else sellCount++
    }

    return {
      totalVolume: volSum,
      vwap: volSum > 0 ? pvSum / volSum : 0,
      averageSize: this.trades.length > 0 ? sizeSum / this.trades.length : 0,
      buyCount,
      sellCount,
    }
  }
}
