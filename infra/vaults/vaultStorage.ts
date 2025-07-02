
import { Connection, PublicKey } from '@solana/web3.js'

export class VaultStorage {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl)
  }

  async listTransactions(address: string, limit = 10) {
    const publicKey = new PublicKey(address)
    return this.connection.getSignaturesForAddress(publicKey, { limit })
  }
}
