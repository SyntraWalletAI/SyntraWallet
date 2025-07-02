import fetch from 'node-fetch'

export interface MarketQuote {
  symbol: string
  price: number
  volume24h: number
  change24h: number
}

export class MarketApi {
  constructor(private baseUrl: string) {}

  async getQuote(symbol: string): Promise<MarketQuote> {
    const res = await fetch(`${this.baseUrl}/market/quote?symbol=${symbol}`)
    const data = await res.json()
    return {
      symbol: data.symbol,
      price: data.price,
      volume24h: data.volume_24h,
      change24h: data.change_24h
    }
  }

  async listTopMarkets(limit = 10): Promise<MarketQuote[]> {
    const res = await fetch(`${this.baseUrl}/market/top?limit=${limit}`)
    const list = await res.json()
    return list.map((item: any) => ({
      symbol: item.symbol,
      price: item.price,
      volume24h: item.volume_24h,
      change24h: item.change_24h
    }))
  }
}
