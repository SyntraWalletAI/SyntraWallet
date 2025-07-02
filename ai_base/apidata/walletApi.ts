import fetch from 'node-fetch'

export interface WalletBalance {
  address: string
  lamports: number
}

export interface TransactionRecord {
  signature: string
  slot: number
  success: boolean
}

export class WalletApi {
  constructor(private rpcUrl: string) {}

  async getBalance(address: string): Promise<WalletBalance> {
    const res = await fetch(`${this.rpcUrl}/balance/${address}`)
    const data = await res.json()
    return { address, lamports: data.lamports }
  }

  async listTransactions(address: string, limit = 20): Promise<TransactionRecord[]> {
    const res = await fetch(`${this.rpcUrl}/transactions/${address}?limit=${limit}`)
    const list = await res.json()
    return list.map((tx: any) => ({
      signature: tx.signature,
      slot: tx.slot,
      success: tx.err === null
    }))
  }
}
