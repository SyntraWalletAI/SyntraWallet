
export interface Trade {
  timestamp: number
  price: number
  size: number
  side: "buy" | "sell"
}

/**
 * Fetch recent trades for a market symbol from a REST API.
 */
export class TradeFetcher {
  constructor(private apiBase: string) {}

  /**
   * Retrieve the latest `limit` trades for `symbol`.
   * Expects endpoint: `${apiBase}/trades?symbol=...&limit=...`
   */
  async fetchRecent(symbol: string, limit: number = 100): Promise<Trade[]> {
    const url = `${this.apiBase}/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch trades: ${res.status}`)
    return (await res.json()) as Trade[]
  }
}