import { Connection, PublicKey, AccountInfo, RpcResponseAndContext } from '@solana/web3.js'

export class VaultClient {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')  // Added 'confirmed' commitment for more reliable data
  }

  /**
   * Fetch account information by public key.
   * @param key The public key of the account (string format).
   * @returns Account info or null if not found.
   */
  async fetchAccountInfo(key: string): Promise<AccountInfo<Buffer> | null> {
    const publicKey = new PublicKey(key)
    try {
      const accountInfo = await this.connection.getAccountInfo(publicKey)
      if (!accountInfo) {
        console.warn(`Account info for ${key} not found.`)
      }
      return accountInfo
    } catch (error) {
      console.error(`Failed to fetch account info for ${key}:`, error)
      throw new Error(`Failed to fetch account info for ${key}`)
    }
  }

  /**
   * Get the balance of an account.
   * @param key The public key of the account.
   * @returns Balance in lamports (1 SOL = 1e9 lamports)
   */
  async getAccountBalance(key: string): Promise<number> {
    const publicKey = new PublicKey(key)
    try {
      const balance = await this.connection.getBalance(publicKey)
      return balance
    } catch (error) {
      console.error(`Failed to fetch balance for ${key}:`, error)
      throw new Error(`Failed to fetch balance for ${key}`)
    }
  }

  /**
   * Get transaction history for an account.
   * @param key The public key of the account.
   * @param limit Maximum number of transactions to fetch.
   * @returns List of transaction signatures.
   */
  async getTransactionHistory(key: string, limit: number = 10): Promise<string[]> {
    const publicKey = new PublicKey(key)
    try {
      const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit })
      return signatures.map((sig: RpcResponseAndContext<any>) => sig.signature)
    } catch (error) {
      console.error(`Failed to fetch transaction history for ${key}:`, error)
      throw new Error(`Failed to fetch transaction history for ${key}`)
    }
  }
}
