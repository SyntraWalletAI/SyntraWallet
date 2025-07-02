
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical'

export interface AlertOptions {
  level: AlertLevel
  message: string
  data?: any
  timestamp?: number
}

export class AlertService {
  private transports: Array<(opts: AlertOptions) => void> = []

  constructor() {
    // default console transport
    this.transports.push(opts => {
      const time = new Date(opts.timestamp || Date.now()).toISOString()
      console.log(`[${time}] [${opts.level.toUpperCase()}] ${opts.message}`, opts.data || '')
    })
  }

  addTransport(transport: (opts: AlertOptions) => void): void {
    this.transports.push(transport)
  }

  send(opts: AlertOptions): void {
    opts.timestamp = opts.timestamp || Date.now()
    this.transports.forEach(t => t(opts))
  }
}
