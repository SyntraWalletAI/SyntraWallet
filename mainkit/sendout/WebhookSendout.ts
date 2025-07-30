// sendout/WebhookSendout.ts

export interface WebhookMessage {
  url: string
  method?: "POST" | "PUT" | "PATCH"
  headers?: Record<string, string>
  body: any
  timeoutMs?: number
}

export interface WebhookSendoutOptions {
  /** Number of retry attempts on failure (default: 2) */
  retries?: number
  /** Milliseconds base backoff between retries (default: 500) */
  backoffMs?: number
  /** Hooks for instrumentation */
  hooks?: {
    onRequest?: (msg: WebhookMessage, attempt: number) => void
    onSuccess?: (msg: WebhookMessage, responseStatus: number) => void
    onError?: (msg: WebhookMessage, error: Error, attempt: number) => void
  }
}

/** Simple structured logger */
const logger = {
  info: (msg: string, meta: any = {}) =>
    console.log({ level: "info", timestamp: new Date().toISOString(), msg, ...meta }),
  warn: (msg: string, meta: any = {}) =>
    console.warn({ level: "warn", timestamp: new Date().toISOString(), msg, ...meta }),
  error: (msg: string, meta: any = {}) =>
    console.error({ level: "error", timestamp: new Date().toISOString(), msg, ...meta }),
}

export class WebhookSendout {
  private retries: number
  private backoffMs: number
  private hooks: Required<WebhookSendoutOptions>["hooks"]

  constructor(opts: WebhookSendoutOptions = {}) {
    this.retries = opts.retries ?? 2
    this.backoffMs = opts.backoffMs ?? 500
    this.hooks = {
      onRequest: opts.hooks?.onRequest ?? (() => {}),
      onSuccess: opts.hooks?.onSuccess ?? (() => {}),
      onError: opts.hooks?.onError ?? (() => {}),
    }
  }

  /**
   * Send a webhook request with retries, timeout, and structured logging.
   */
  public async send(msg: WebhookMessage): Promise<void> {
    if (!msg.url) throw new Error("WebhookMessage.url is required")

    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      const timeout = msg.timeoutMs ?? 10000
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      try {
        logger.info("Sending webhook", { url: msg.url, attempt })
        this.hooks.onRequest(msg, attempt)

        const response = await fetch(msg.url, {
          method: msg.method ?? "POST",
          headers: { "Content-Type": "application/json", ...(msg.headers || {}) },
          body: JSON.stringify(msg.body),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!response.ok) {
          const text = await response.text().catch(() => "")
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        logger.info("Webhook succeeded", { url: msg.url, status: response.status })
        this.hooks.onSuccess(msg, response.status)
        return
      } catch (err: any) {
        clearTimeout(timer)
        const isAbort = err.name === "AbortError"
        const errorMsg = isAbort ? `Timeout after ${timeout}ms` : err.message
        logger.warn("Webhook attempt failed", { url: msg.url, attempt, error: errorMsg })
        this.hooks.onError(msg, err, attempt)

        const canRetry = attempt <= this.retries && !isAbort
        if (canRetry) {
          await this.delay(this.backoffMs * attempt)
          continue
        }

        logger.error("Webhook failed", { url: msg.url, error: errorMsg })
        throw new Error(`WebhookSendout failed: ${errorMsg}`)
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
