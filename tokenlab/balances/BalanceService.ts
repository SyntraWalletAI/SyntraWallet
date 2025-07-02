
export class BalanceService {
  private cache = new Map<string, { balance: number; fetchedAt: number }>()

  constructor(
    private rpcEndpoint: string,
    private cacheTtlMs: number = 60_000
  ) {}

  private async fetchBalanceOnChain(address: string): Promise<number> {
    const res = await fetch(this.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getBalance",
        params: [address],
        id: 1
      })
    })
    if (!res.ok) throw new Error(`RPC error ${res.status}`)
    const { result } = await res.json()
    return typeof result === "number" ? result : result.value
  }

  /**
   * Get wallet balance, using cache if recent.
   */
  async getBalance(address: string): Promise<number> {
    const now = Date.now()
    const entry = this.cache.get(address)
    if (entry && now - entry.fetchedAt < this.cacheTtlMs) {
      return entry.balance
    }
    const balance = await this.fetchBalanceOnChain(address)
    this.cache.set(address, { balance, fetchedAt: now })
    return balance
  }
}