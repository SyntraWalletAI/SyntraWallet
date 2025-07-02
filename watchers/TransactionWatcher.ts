
export interface TransactionEvent {
  walletAddress: string
  txHash: string
  blockNumber: number
  timestamp: number
}

/**
 * Watches an address for new transactions via block explorer API.
 */
export class TransactionWatcher {
  private seenTxs = new Map<string, Set<string>>()
  private intervalId?: NodeJS.Timeout

  /**
   * @param apiEndpoint REST endpoint returning transactions for an address
   * @param pollIntervalMs Poll interval in milliseconds
   */
  constructor(
    private apiEndpoint: string,
    private pollIntervalMs: number = 15_000
  ) {}

  private async fetchTxs(address: string): Promise<Array<{ hash: string; block: number; time: number }>> {
    const res = await fetch(`${this.apiEndpoint}/txs/${encodeURIComponent(address)}`)
    if (!res.ok) throw new Error(`Explorer API error ${res.status}`)
    return (await res.json()) as any[]
  }

  /**
   * Start watching addresses.  
   * Emits onTx for each new transaction seen.
   */
  start(
    addresses: string[],
    onTx: (event: TransactionEvent) => void
  ): void {
    addresses.forEach(addr => this.seenTxs.set(addr, new Set()))

    this.intervalId = setInterval(async () => {
      for (const addr of addresses) {
        try {
          const txs = await this.fetchTxs(addr)
          const seen = this.seenTxs.get(addr)!
          for (const tx of txs) {
            if (!seen.has(tx.hash)) {
              seen.add(tx.hash)
              onTx({
                walletAddress: addr,
                txHash: tx.hash,
                blockNumber: tx.block,
                timestamp: tx.time * 1000
              })
            }
          }
        } catch {
          // ignore per-address errors
        }
      }
    }, this.pollIntervalMs)
  }

  /** Stop watching for transactions. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}