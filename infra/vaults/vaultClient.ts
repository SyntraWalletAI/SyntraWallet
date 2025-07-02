
import { Connection, PublicKey } from '@solana/web3.js'

export class VaultClient {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl)
  }

  async fetchAccount(key: string) {
    const publicKey = new PublicKey(key)
    return this.connection.getAccountInfo(publicKey)
  }
}
