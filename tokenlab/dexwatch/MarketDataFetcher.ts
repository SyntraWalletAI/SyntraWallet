
export interface PricePoint {
  symbol: string
  price: number
  timestamp: number
}

/**
 * Fetches the latest price for a given market symbol.
 */
export class MarketDataFetcher {
  constructor(private apiBase: string) {}

  /**
   * Fetch the current price for the symbol.
   * @param symbol e.g. "ETH/USD"
   */
  async fetchPrice(symbol: string): Promise<PricePoint> {
    const res = await fetch(`${this.apiBase}/price?symbol=${encodeURIComponent(symbol)}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch price for ${symbol}: ${res.status}`)
    }
    const json = await res.json() as { price: number }
    return {
      symbol,
      price: json.price,
      timestamp: Date.now(),
    }
  }
}