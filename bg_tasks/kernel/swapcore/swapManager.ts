import { SwapApi } from './swapApi'
import { PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'

export class SwapManager {
  private api: SwapApi
  private wallet: { publicKey: PublicKey; signTransaction(tx: Transaction): Promise<Transaction> }

  constructor(rpcUrl: string, wallet: { publicKey: PublicKey; signTransaction(tx: Transaction): Promise<Transaction> }) {
    this.api = new SwapApi(rpcUrl)
    this.wallet = wallet
  }

  async swap(params: {
    fromSymbol: string
    toSymbol: string
    amount: number
    slippage: number
  }): Promise<{ txSignature: string; received: number }> {
    const fromMint = await this.api.resolveMint(params.fromSymbol)
    const toMint = await this.api.resolveMint(params.toSymbol)
    const quote = await this.api.getQuote({ fromMint, toMint, amount: params.amount })
    const minOut = quote.amountOut * (1 - params.slippage)
    const transaction = new Transaction()
    const fromAccount = await Token.getAssociatedTokenAddress(TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, fromMint, this.wallet.publicKey)
    const toAccount = await Token.getAssociatedTokenAddress(TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, toMint, this.wallet.publicKey)
    transaction.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromAccount,
        toAccount,
        this.wallet.publicKey,
        [],
        params.amount
      )
    )
    const signed = await this.wallet.signTransaction(transaction)
    const txSignature = await sendAndConfirmTransaction(this.api['connection'], signed)
    return { txSignature, received: Math.max(minOut, quote.amountOut) }
  }
}
