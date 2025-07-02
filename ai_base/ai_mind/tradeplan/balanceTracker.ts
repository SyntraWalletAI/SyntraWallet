import { Connection, PublicKey, Commitment } from '@solana/web3.js'
import EventEmitter from 'events'

export interface BalanceRecord {
  address: string
  lamports: number
  timestamp: number
}

export class BalanceTracker extends EventEmitter {
  private connection: Connection
  private commitment: Commitment
  private records: Map<string, BalanceRecord> = new Map()
  private intervalMs: number

  constructor(rpcUrl: string, intervalMs: number = 15000, commitment: Commitment = 'confirmed') {
    super()
    this.connection = new Connection(rpcUrl, commitment)
    this.commitment = commitment
    this.intervalMs = intervalMs
  }

  subscribe(addresses: string[]): void {
    addresses.forEach(addr => {
      if (!this.records.has(addr)) {
        this.records.set(addr, { address: addr, lamports: 0, timestamp: 0 })
      }
    })
    this.startPolling()
  }

  unsubscribe(addresses: string[]): void {
    addresses.forEach(addr => this.records.delete(addr))
    if (!this.records.size) this.stopPolling()
  }

  private async poll(): Promise<void> {
    for (const rec of this.records.values()) {
      const pub = new PublicKey(rec.address)
      const lamports = await this.connection.getBalance(pub, this.commitment)
      const now = Date.now()
      if (lamports !== rec.lamports) {
        const record: BalanceRecord = { address: rec.address, lamports, timestamp: now }
        this.records.set(rec.address, record)
        this.emit('balanceUpdate', record)
      }
    }
  }

  private timer?: NodeJS.Timeout

  private startPolling(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), this.intervalMs)
  }

  private stopPolling(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  getHistory(address: string): BalanceRecord[] {
    return Array.from(this.records.values()).filter(r => r.address === address)
  }
}
