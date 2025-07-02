import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'

export interface TxOptions {
  maxRetries: number
  timeoutMs: number
}

export class TxSigner {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async send(
    transaction: Transaction,
    signers: Array<{ publicKey: PublicKey; secretKey: Uint8Array }>,
    opts: TxOptions = { maxRetries: 2, timeoutMs: 20000 }
  ): Promise<string> {
    const raw = transaction.serialize({ requireAllSignatures: false })
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const sig = await this.connection.sendRawTransaction(raw, { skipPreflight: true })
        const status = await this.connection.confirmTransaction(sig, 'finalized')
        if (status.value.err) throw new Error('on-chain error')
        return sig
      } catch (err) {
        lastError = err as Error
        if (attempt === opts.maxRetries) break
        await this.sleep(500 * (attempt + 1))
      }
    }
    throw lastError || new Error('transaction failed')
  }

  buildTransfer(
    from: PublicKey,
    to: PublicKey,
    amount: number
  ): Transaction {
    const tx = new Transaction()
    tx.add({
      keys: [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true }],
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      data: Buffer.from(Uint8Array.of(3, ...new Uint8Array(new Uint32Array([amount]).buffer)))
    })
    return tx
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
