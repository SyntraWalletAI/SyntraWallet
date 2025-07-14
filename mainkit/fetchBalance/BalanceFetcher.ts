export class BalanceFetcher {
  constructor(private rpcUrl: string) {}

  async fetch(address: string): Promise<number> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "getBalance",
          params: [address],
          id: 1
        })
      })

      if (!response.ok) {
        throw new Error(`RPC ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as {
        jsonrpc: "2.0"
        result: number | { value: number }
        id: number
      }

      const raw = data.result
      const balance = typeof raw === "number" ? raw : raw.value

      if (typeof balance !== "number") {
        throw new Error("Unexpected balance format")
      }

      return balance
    } catch (err: any) {
      console.error("Balance fetch failed:", err)
      throw new Error(err.message || "Failed to fetch balance")
    }
  }
}
