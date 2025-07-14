import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js'

export class ContainerManager {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async getBalance(address: string): Promise<number> {
    return this.connection.getBalance(new PublicKey(address))
  }

  async getTokenAccounts(address: string): Promise<{ mint: string; amount: number }[]> {
    const resp = await this.connection.getParsedTokenAccountsByOwner(
      new PublicKey(address),
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    )
    return resp.value.map(({ account }) => {
      const info: any = account.data.parsed.info
      return { mint: info.mint, amount: info.tokenAmount.uiAmount }
    })
  }

  async transferSol(from: Keypair, to: string, amountLamports: number): Promise<string> {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: new PublicKey(to),
        lamports: amountLamports,
      })
    )
    return sendAndConfirmTransaction(this.connection, tx, [from])
  }

  async getRecentSignatures(address: string, limit = 50): Promise<string[]> {
    const sigs = await this.connection.getSignaturesForAddress(
      new PublicKey(address),
      { limit }
    )
    return sigs.map(s => s.signature)
  }
}
