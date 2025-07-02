export interface DepthPoint {
  price: number
  size: number
}

export class DeepAnalyzer {
  computeDepth(book: { bids: DepthPoint[]; asks: DepthPoint[] }): { bidDepth: number; askDepth: number; imbalance: number } {
    const bidDepth = book.bids.reduce((sum, b) => sum + b.price * b.size, 0)
    const askDepth = book.asks.reduce((sum, a) => sum + a.price * a.size, 0)
    const imbalance = bidDepth && askDepth ? (bidDepth - askDepth) / (bidDepth + askDepth) : 0
    return { bidDepth, askDepth, imbalance }
  }
}
