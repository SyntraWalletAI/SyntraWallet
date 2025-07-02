import { Connection, PublicKey } from '@solana/web3.js'

export class FlowAnalyzer {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async calculateShiftVolume(address: string, limit = 50): Promise<number> {
    const pub = new PublicKey(address)
    const sigs = await this.connection.getSignaturesForAddress(pub, { limit })
    const promises = sigs.map(s => this.connection.getParsedTransaction(s.signature, 'confirmed'))
    const txs = await Promise.all(promises)
    return txs.reduce((sum, tx) => {
      const lamports = tx?.meta?.postBalances?.[0] ?? 0
      return sum + lamports
    }, 0)
  }

  async peakShiftPeriod(address: string, window = 5): Promise<{ start: number; volume: number }> {
    const now = Date.now()
    const chunk = 3600 * 1000 
    let best = { start: now, volume: 0 }
    for (let i = 0; i < window; i++) {
      const start = now - i * chunk
      const end = start - chunk
      const sigs = await this.connection.getSignaturesForAddress(new PublicKey(address), { before: undefined, limit: 100 })
      const vols = sigs.map(s => s.slot).filter(slot => slot <= start && slot > end).length
      if (vols > best.volume) best = { start, volume: vols }
    }
    return best
  }
}
