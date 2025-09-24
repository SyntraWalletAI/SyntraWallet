export interface OrderLevel {
  price: number
  size: number
}

export interface OrderBook {
  bids: OrderLevel[]
  asks: OrderLevel[]
}

export interface LiquidityStressResult {
  imbalancePct: number // 0–100
  spreadPct: number    // relative spread in %
  bidDepth: number
  askDepth: number
}

export class LiquidityStressEvaluator {
  evaluate(book: OrderBook): LiquidityStressResult {
    const bidDepth = book.bids?.reduce((s, b) => s + (b.size || 0), 0) || 0
    const askDepth = book.asks?.reduce((s, a) => s + (a.size || 0), 0) || 0

    const imbalance =
      bidDepth && askDepth
        ? Math.abs(bidDepth - askDepth) / (bidDepth + askDepth)
        : 0

    const bestBid = book.bids?.[0]?.price ?? 0
    const bestAsk = book.asks?.[0]?.price ?? 0
    const spreadPct =
      bestBid && bestAsk ? ((bestAsk - bestBid) / bestBid) * 100 : 0

    return {
      imbalancePct: Math.min(100, Math.max(0, imbalance * 100)),
      spreadPct: Math.max(0, spreadPct),
      bidDepth,
      askDepth,
    }
  }
}
