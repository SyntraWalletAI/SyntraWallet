
export interface RawBalanceResponse {
  jsonrpc: "2.0"
  result: number | { value: number }
  id: number
}


export class BalanceFetcher {
  constructor(private rpcUrl: string) {}


  async fetch(address: string): Promise<number> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getBalance",
        params: [address],
        id: 1
      })
    })
    if (!res.ok) {
      throw new Error(`RPC error ${res.status}: ${res.statusText}`)
    }
    const data = (await res.json()) as RawBalanceResponse
    const val = typeof data.result === "number" ? data.result : data.result.value
    if (typeof val !== "number") {
      throw new Error("Invalid balance format")
    }
    return val
  }
}
