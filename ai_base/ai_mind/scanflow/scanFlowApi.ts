import { Connection, PublicKey, ParsedConfirmedTransaction, Commitment } from '@solana/web3.js'
import EventEmitter from 'events'

export class ScanFlowApi {
  private connection: Connection
  private commitment: Commitment

  constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
    this.connection = new Connection(rpcUrl, commitment)
    this.commitment = commitment
  }

  async getRecentTransactions(address: string, limit: number = 50): Promise<string[]> {
    const pub = new PublicKey(address)
    const sigs = await this.connection.getSignaturesForAddress(pub, { limit })
    return sigs.map(s => s.signature)
  }

  async fetchParsedTransaction(signature: string): Promise<ParsedConfirmedTransaction | null> {
    return await this.connection.getParsedTransaction(signature, this.commitment)
  }

  async getBalanceChanges(address: string, signatures: string[]): Promise<number[]> {
    const pub = new PublicKey(address)
    const results: number[] = []
    for (const sig of signatures) {
      const tx = await this.connection.getParsedTransaction(sig, this.commitment)
      const pre = tx?.meta?.preBalances?.[0] ?? 0
      const post = tx?.meta?.postBalances?.[0] ?? 0
      results.push(post - pre)
    }
    return results
  }
}
