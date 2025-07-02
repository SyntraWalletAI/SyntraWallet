import { Connection, PublicKey } from '@solana/web3.js'

export class SwapValidator {
  private connection: Connection

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async hasBalance(address: string, required: number): Promise<boolean> {
    const pub = new PublicKey(address)
    const balance = await this.connection.getBalance(pub)
    return balance >= required
  }

  validateSlippage(quoted: number, minAcceptable: number): boolean {
    return quoted >= minAcceptable
  }

  validateSymbols(symbols: string[]): boolean {
    return symbols.every(s => /^[A-Z0-9]{3,6}$/.test(s))
  }
}
