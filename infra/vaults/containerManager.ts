
import { Connection, PublicKey } from '@solana/web3.js'

export class ContainerManager {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl)
  }

  async initialize(address: string) {
    const publicKey = new PublicKey(address)
    return this.connection.getBalance(publicKey)
  }
}
