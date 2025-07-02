export class LiquidityStressEvaluator {
  evaluate(book: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> }): number {
    const bidDepth = book.bids.reduce((sum, b) => sum + b.size, 0)
    const askDepth = book.asks.reduce((sum, a) => sum + a.size, 0)
    const imbalance = bidDepth && askDepth ? Math.abs(bidDepth - askDepth) / (bidDepth + askDepth) : 0
    return Math.min(1, Math.max(0, imbalance)) * 100
  }
}
