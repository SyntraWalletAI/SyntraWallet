import { EventEmitter } from 'events'

export interface PulseOptions {
  threshold: number
  windowMs: number
  maxHistory: number
}

export interface PulseEvent {
  timestamp: number
  value: number
}

export class PulseEmitter extends EventEmitter {
  private threshold: number
  private windowMs: number
  private history: PulseEvent[] = []
  private timer?: NodeJS.Timeout

  constructor(private opts: PulseOptions) {
    super()
    this.threshold = opts.threshold
    this.windowMs = opts.windowMs
  }

  start(intervalMs: number): void {
    if (this.timer) return
    this.timer = setInterval(() => this.emitPulse(), intervalMs)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  record(value: number): void {
    const now = Date.now()
    this.history.push({ timestamp: now, value })
    if (this.history.length > this.opts.maxHistory) {
      this.history.shift()
    }
    if (value >= this.threshold) {
      this.emit('pulse', { timestamp: now, value })
    }
  }

  private emitPulse(): void {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const recent = this.history.filter(e => e.timestamp >= cutoff)
    const max = recent.reduce((m, e) => e.value > m ? e.value : m, 0)
    if (max >= this.threshold) {
      this.emit('pulse', { timestamp: now, value: max })
    }
  }

  getHistory(sinceMs: number): PulseEvent[] {
    const cutoff = Date.now() - sinceMs
    return this.history.filter(e => e.timestamp >= cutoff)
  }
}
