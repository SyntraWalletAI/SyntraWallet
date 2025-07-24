import { Connection, PublicKey, ConfirmedSignatureInfo, ParsedConfirmedTransaction } from '@solana/web3.js'
import { EventEmitter } from 'events'
import { z } from 'zod'

export interface BirthSignal {
  mint: string
  blockTime: number
  txSignature: string
}

/** Raw config schema */
const birthWatcherConfigSchema = z.object({
  rpcUrl: z.string().url(),
  pollIntervalMs: z.number().int().positive().default(10_000),
})

export class TokenBirthWatcher extends EventEmitter {
  private connection: Connection
  private programId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  private lastSeenSlot = 0
  private pollIntervalMs: number
  private intervalHandle: NodeJS.Timeout | null = null

  constructor(rawConfig: unknown) {
    super()
    const { rpcUrl, pollIntervalMs } = birthWatcherConfigSchema.parse(rawConfig)
    this.connection = new Connection(rpcUrl, 'confirmed')
    this.pollIntervalMs = pollIntervalMs
  }

  /** Start polling; emits 'birth' with a JSON string payload */
  public start(): void {
    if (this.intervalHandle) return
    this.poll().catch(err => this.emit('error', JSON.stringify({ error: err.message })))
    this.intervalHandle = setInterval(() => {
      this.poll().catch(err => this.emit('error', JSON.stringify({ error: err.message })))
    }, this.pollIntervalMs)
  }

  /** Stop polling */
  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
      this.emit('stopped', JSON.stringify({ timestamp: Date.now() }))
    }
  }

  private async poll(): Promise<void> {
    const slot = await this.connection.getSlot('confirmed')
    const sigs: ConfirmedSignatureInfo[] = await this.connection.getSignaturesForAddress(
      this.programId,
      { limit: 100 }
    )
    for (const info of sigs) {
      if (info.slot <= this.lastSeenSlot) continue
      const tx: ParsedConfirmedTransaction | null =
        await this.connection.getParsedConfirmedTransaction(info.signature, 'confirmed')
      if (tx?.meta?.logMessages) {
        for (const log of tx.meta.logMessages) {
          if (log.includes('Instruction: InitializeMint')) {
            // find the mint account in the transaction's account keys
            const mintKey = tx.transaction.message.accountKeys.find((ak, idx) =>
              tx.transaction.message.instructions.some(instr =>
                ('parsed' in instr && instr.parsed?.type === 'initializeMint' &&
                 instr.parsed.info.mint === ak.pubkey.toBase58())
              )
            )?.pubkey.toBase58()
            if (mintKey) {
              const signal: BirthSignal = {
                mint: mintKey,
                blockTime: tx.blockTime ?? Date.now(),
                txSignature: info.signature,
              }
              // emit JSON string
              this.emit('birth', JSON.stringify(signal))
            }
          }
        }
      }
    }
    this.lastSeenSlot = slot
  }
}
