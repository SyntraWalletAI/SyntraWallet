// WatchApi.ts

import { Connection, PublicKey, Commitment, AccountInfo, ParsedTransactionWithMeta } from '@solana/web3.js'
import { z } from 'zod'
import pLimit from 'p-limit'

// Zod schemas
const PublicKeyStringSchema = z.string().refine(s => {
  try { new PublicKey(s); return true } catch { return false }
}, { message: 'Invalid Base58 public key' })

const LimitSchema = z.number().int().positive().default(20)

export interface AccountChangeCallback {
  (accountInfo: AccountInfo<Buffer>, context: { slot: number }): void
}

export class WatchApi {
  private connection: Connection
  private commitment: Commitment

  constructor(rpcUrl: string, commitment: Commitment = 'confirmed') {
    if (typeof rpcUrl !== 'string' || !rpcUrl) {
      throw new Error('rpcUrl is required')
    }
    this.commitment = commitment
    this.connection = new Connection(rpcUrl, commitment)
  }

  /**
   * Subscribe to account data changes.
   * @returns subscriptionId which can be used to unsubscribe
   */
  public subscribeAccount(
    publicKeyString: string,
    callback: AccountChangeCallback
  ): number {
    const key = PublicKeyStringSchema.parse(publicKeyString)
    const publicKey = new PublicKey(key)
    const id = this.connection.onAccountChange(
      publicKey,
      callback,
      this.commitment
    )
    return id
  }

  /**
   * Unsubscribe from account changes.
   */
  public unsubscribeAccount(subscriptionId: number): void {
    if (!Number.isInteger(subscriptionId)) {
      throw new Error('subscriptionId must be an integer')
    }
    this.connection.removeAccountChangeListener(subscriptionId).catch(err => {
      console.warn(`Failed to remove listener ${subscriptionId}:`, err)
    })
  }

  /**
   * Fetch current account balance in lamports.
   */
  public async getBalance(publicKeyString: string): Promise<number> {
    const key = PublicKeyStringSchema.parse(publicKeyString)
    const publicKey = new PublicKey(key)
    return this.connection.getBalance(publicKey, this.commitment)
  }

  /**
   * Fetch recent transaction signatures for the given publicKey.
   */
  public async getRecentSignatures(
    publicKeyString: string,
    limit?: number
  ): Promise<string[]> {
    const key = PublicKeyStringSchema.parse(publicKeyString)
    const sigLimit = LimitSchema.parse(limit)
    const publicKey = new PublicKey(key)
    const sigInfos = await this.connection.getSignaturesForAddress(publicKey, { limit: sigLimit })
    return sigInfos.map(info => info.signature)
  }

  /**
   * Fetch parsed transaction data by signature, with concurrency control.
   */
  public async getParsedTransactions(
    signatures: string[],
    concurrency: number = 5
  ): Promise<(ParsedTransactionWithMeta | null)[]> {
    const sigSchema = z.array(z.string().min(1)).nonempty()
    const sigs = sigSchema.parse(signatures)
    if (concurrency < 1 || !Number.isInteger(concurrency)) {
      throw new Error('concurrency must be a positive integer')
    }
    const limit = pLimit(concurrency)
    const results = await Promise.all(
      sigs.map(sig =>
        limit(async () => {
          try {
            return await this.connection.getParsedTransaction(sig, this.commitment)
          } catch (err) {
            console.warn(`Failed to fetch transaction ${sig}:`, err)
            return null
          }
        })
      )
    )
    return results
  }
}
