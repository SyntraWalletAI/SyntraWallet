
export interface BalanceChange {
  walletAddress: string
  oldBalance: number
  newBalance: number
  timestamp: number
}

/**
 * Polls a blockchain RPC for a wallet’s balance and emits changes.
 */
export class BalanceWatcher {
  private lastBalances = new Map<string, number>()
  private intervalId?: NodeJS.Timeout

  /**
   * @param rpcEndpoint URL of the JSON-RPC endpoint
   * @param pollIntervalMs How often to poll, in milliseconds
   */
  constructor(
    private rpcEndpoint: string,
    private pollIntervalMs: number = 15_000
  ) {}

  private async fetchBalance(address: string): Promise<number> {
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
   * Start watching the given addresses.  
   * Emits onChange for each balance update.
   */
  start(
    addresses: string[],
    onChange: (change: BalanceChange) => void
  ): void {
    // initialize
    addresses.forEach(addr => this.lastBalances.set(addr, 0))

    this.intervalId = setInterval(async () => {
      for (const addr of addresses) {
        try {
          const newBal = await this.fetchBalance(addr)
          const oldBal = this.lastBalances.get(addr) ?? 0
          if (newBal !== oldBal) {
            const change: BalanceChange = {
              walletAddress: addr,
              oldBalance: oldBal,
              newBalance: newBal,
              timestamp: Date.now()
            }
            this.lastBalances.set(addr, newBal)
            onChange(change)
          }
        } catch {
          // ignore per-address errors
        }
      }
    }, this.pollIntervalMs)
  }

  /** Stop polling balances. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}