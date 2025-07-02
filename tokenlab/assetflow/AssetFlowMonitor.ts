
export interface TransferRecord {
  txHash: string
  timestamp: number
  from: string
  to: string
  amount: number
  token: string
}

/**
 * Polls a REST endpoint for new transfer events and emits them.
 */
export class AssetFlowMonitor {
  private seen = new Set<string>()
  private intervalId?: NodeJS.Timeout

  constructor(
    private apiEndpoint: string,
    private pollIntervalMs: number = 15_000
  ) {}

  private async fetchTransfers(): Promise<TransferRecord[]> {
    const res = await fetch(`${this.apiEndpoint}/transfers`)
    if (!res.ok) throw new Error(`Fetch error ${res.status}`)
    return (await res.json()) as TransferRecord[]
  }

  /**
   * Start monitoring: calls onNew for each unseen transfer.
   */
  start(onNew: (tx: TransferRecord) => void): void {
    this.intervalId = setInterval(async () => {
      try {
        const list = await this.fetchTransfers()
        for (const tx of list) {
          if (!this.seen.has(tx.txHash)) {
            this.seen.add(tx.txHash)
            onNew(tx)
          }
        }
      } catch {
        // ignore errors
      }
    }, this.pollIntervalMs)
  }

  /** Stop monitoring. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}