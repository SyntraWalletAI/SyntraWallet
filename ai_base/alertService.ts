// alertService.ts

import { z } from "zod"

// Alert levels
export const AlertLevelSchema = z.enum(['info', 'warning', 'error', 'critical'])
export type AlertLevel = z.infer<typeof AlertLevelSchema>

// Alert options schema
export const AlertOptionsSchema = z.object({
  level: AlertLevelSchema,
  message: z.string().min(1),
  data: z.unknown().optional(),
  timestamp: z.number().int().positive().optional(),
})

export type AlertOptions = z.infer<typeof AlertOptionsSchema>

// Transport type
export type AlertTransport = (opts: AlertOptions) => void | Promise<void>

export class AlertService {
  private transports: Set<AlertTransport> = new Set()

  constructor() {
    // default console transport
    this.addTransport(opts => {
      const time = new Date(opts.timestamp).toISOString()
      console.log(
        `[${time}] [${opts.level.toUpperCase()}] ${opts.message}`,
        opts.data ?? ''
      )
    })
  }

  /**
   * Add a transport. Returns an unsubscribe function.
   */
  public addTransport(transport: AlertTransport): () => void {
    this.transports.add(transport)
    return () => this.transports.delete(transport)
  }

  /**
   * Clear all transports.
   */
  public clearTransports(): void {
    this.transports.clear()
  }

  /**
   * Send an alert to all transports. Waits for all transports to settle.
   */
  public async send(rawOpts: AlertOptions): Promise<void> {
    // Validate and apply defaults
    const parsed = AlertOptionsSchema.parse(rawOpts)
    const opts: AlertOptions = {
      ...parsed,
      timestamp: parsed.timestamp ?? Date.now(),
    }

    // Dispatch to all transports concurrently
    const tasks = Array.from(this.transports).map(async transport => {
      try {
        await transport(opts)
      } catch (err: any) {
        console.error("Alert transport error:", err)
      }
    })

    await Promise.allSettled(tasks)
  }
}
