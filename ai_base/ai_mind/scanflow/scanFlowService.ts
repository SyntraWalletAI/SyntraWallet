import { ScanFlowApi } from './scanFlowApi'
import { EventEmitter } from 'events'

export interface FlowRecord {
  address: string
  change: number
  timestamp: number
}

export class ScanFlowService extends EventEmitter {
  private api: ScanFlowApi
  private tracked: Set<string> = new Set()
  private history: FlowRecord[] = []

  constructor(rpcUrl: string) {
    super()
    this.api = new ScanFlowApi(rpcUrl)
  }

  async track(address: string): Promise<void> {
    if (this.tracked.has(address)) return
    this.tracked.add(address)
    const sigs = await this.api.getRecentTransactions(address)
    const changes = await this.api.getBalanceChanges(address, sigs)
    const now = Date.now()
    for (let i = 0; i < sigs.length; i++) {
      const change = changes[i]
      if (change !== 0) {
        const record: FlowRecord = { address, change, timestamp: now }
        this.history.push(record)
        this.emit('flow', record)
      }
    }
  }

  async poll(intervalMs: number = 20000): Promise<void> {
    setInterval(async () => {
      for (const address of this.tracked) {
        await this.track(address)
      }
    }, intervalMs)
  }

  getHistory(address: string): FlowRecord[] {
    return this.history.filter(r => r.address === address)
  }
}
