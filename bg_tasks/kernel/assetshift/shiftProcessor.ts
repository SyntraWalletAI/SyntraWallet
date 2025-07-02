import { Connection, PublicKey, Transaction } from '@solana/web3.js'

export class ShiftProcessor {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async executeShift(source: string, dest: string, amount: number, payer: PublicKey): Promise<string> {
    const tx = new Transaction()
    const src = new PublicKey(source)
    const dst = new PublicKey(dest)
    tx.add({
      keys: [{ pubkey: src, isSigner: false, isWritable: true }, { pubkey: dst, isSigner: false, isWritable: true }],
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    })
    tx.feePayer = payer
    const { blockhash } = await this.connection.getRecentBlockhash()
    tx.recentBlockhash = blockhash
    const signed = await payer.toBuffer()
    const { signature } = await this.connection.sendRawTransaction(tx.serialize())
    await this.connection.confirmTransaction(signature)
    return signature
  }

  async validateShift(address: string, threshold: number): Promise<boolean> {
    const pub = new PublicKey(address)
    const bal = await this.connection.getBalance(pub)
    return bal >= threshold
  }
}
