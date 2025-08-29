// sendout/WebhookSendout.ts
import { createHmac, randomBytes } from "crypto"

/** Outgoing webhook request */
export interface WebhookMessage {
  url: string
  method?: "POST" | "PUT" | "PATCH" | "GET"
  headers?: Record<string, string>
  /** Serialized automatically if object and Content-Type not explicitly set */
  body?: any
  /** Per-attempt timeout (ms). Default: 10_000 */
  timeoutMs?: number
  /** Optional AbortSignal to cancel the whole send (including retries) */
  signal?: AbortSignal
  /** Optionally set an Idempotency-Key header (will be generated if not provided and autoIdempotency=true) */
  idempotencyKey?: string
}

/** Options controlling retry/backoff, signing, and instrumentation */
export interface WebhookSendoutOptions {
  /** Number of retry attempts on failure (default: 2). Total attempts = retries + 1 */
  retries?: number
  /** Base backoff in ms for exponential backoff (attempt^2 * base). Default: 500 */
  backoffMs?: number
  /** Maximum backoff cap per attempt (ms). Default: 10_000 */
  maxBackoffMs?: number
  /** Add +/- 0..200ms jitter to each backoff. Default: true */
  jitter?: boolean
  /** Generate an Idempotency-Key header for mutating methods if not set. Default: true */
  autoIdempotency?: boolean
  /** Customize retry behavior on HTTP responses (default: retry 408, 429, 5xx) */
  retryOnResponse?: (res: Response) => boolean
  /** Customize retry behavior on network errors (default: true for AbortError=false) */
  retryOnError?: (err: unknown) => boolean
  /** Optional HMAC signer (common for webhooks) */
  signer?: {
    /** Raw secret for HMAC */
    secret: string
    /** Hash algorithm. Default: sha256 */
    algo?: "sha256" | "sha1"
    /** Header name used for signature. Default: "X-Signature" */
    header?: string
    /** Additionally include a UNIX seconds timestamp header (e.g., "X-Signature-Timestamp") */
    timestampHeader?: string
  }
  /** Hooks for instrumentation */
  hooks?: {
    onRequest?: (msg: WebhookMessage, attempt: number) => void
    onSuccess?: (msg: WebhookMessage, responseStatus: number, attempt: number, durationMs: number) => void
    onError?: (msg: WebhookMessage, error: Error, attempt: number) => void
    onRetry?: (msg: WebhookMessage, attempt: number, delayMs: number) => void
  }
}

/** Result information for successful sends */
export interface WebhookResult {
  status: number
  headers: Record<string, string>
  bodyText: string
  attempts: number
  durationMs: number
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
  private readonly retries: number
  private readonly backoffMs: number
  private readonly maxBackoffMs: number
  private readonly jitter: boolean
  private readonly autoIdempotency: boolean
  private readonly signer?: Required<WebhookSendoutOptions>["signer"]
  private readonly hooks: Required<Required<WebhookSendoutOptions>["hooks"]>
  private readonly retryOnResponse: (res: Response) => boolean
  private readonly retryOnError: (err: unknown) => boolean

  constructor(opts: WebhookSendoutOptions = {}) {
    this.retries = opts.retries ?? 2
    this.backoffMs = opts.backoffMs ?? 500
    this.maxBackoffMs = opts.maxBackoffMs ?? 10_000
    this.jitter = opts.jitter ?? true
    this.autoIdempotency = opts.autoIdempotency ?? true

    this.signer = opts.signer
      ? {
          secret: opts.signer.secret,
          algo: opts.signer.algo ?? "sha256",
          header: opts.signer.header ?? "X-Signature",
          timestampHeader: opts.signer.timestampHeader ?? "X-Signature-Timestamp",
        }
      : undefined

    this.retryOnResponse =
      opts.retryOnResponse ??
      ((res) => {
        const s = res.status
        return s === 408 || s === 429 || (s >= 500 && s <= 599)
      })

    this.retryOnError =
      opts.retryOnError ??
      ((err) => {
        const e = err as any
        // Do not retry on aborts/timeouts at our layer (we enforce per-attempt timeout already)
        if (e?.name === "AbortError") return false
        const msg = String(e?.message ?? "").toLowerCase()
        const code = e?.code
        return (
          // network-ish errors
          msg.includes("econnreset") ||
          msg.includes("socket hang up") ||
          msg.includes("network") ||
          msg.includes("fetch failed") ||
          code === "ECONNRESET" ||
          code === "ENOTFOUND" ||
          code === "ECONNREFUSED"
        )
      })

    this.hooks = {
      onRequest: opts.hooks?.onRequest ?? (() => {}),
      onSuccess: opts.hooks?.onSuccess ?? (() => {}),
      onError: opts.hooks?.onError ?? (() => {}),
      onRetry: opts.hooks?.onRetry ?? (() => {}),
    }
  }

  /**
   * Send a webhook request with retries, timeout, signing, idempotency, and structured logging.
   * Returns basic response details on success; throws on final failure.
   */
  public async send(msg: WebhookMessage): Promise<WebhookResult> {
    const started = Date.now()
    const url = this.validateUrl(msg.url)

    const method = (msg.method ?? "POST").toUpperCase() as WebhookMessage["method"]
    const isGet = method === "GET"
    const timeoutMs = msg.timeoutMs ?? 10_000

    // prepare headers
    const headers: Record<string, string> = { ...(msg.headers || {}) }
    if (this.autoIdempotency && !headers["Idempotency-Key"] && (method === "POST" || method === "PUT" || method === "PATCH")) {
      headers["Idempotency-Key"] = msg.idempotencyKey || this.generateIdempotencyKey()
    }

    // resolve body & content-type
    let bodyInit: BodyInit | undefined
    if (!isGet && msg.body !== undefined) {
      const explicitCT = Object.keys(headers).find((h) => h.toLowerCase() === "content-type")
      if (!explicitCT && (typeof msg.body === "object" && !(msg.body instanceof ArrayBuffer) && !(msg.body instanceof Uint8Array))) {
        headers["Content-Type"] = "application/json"
        bodyInit = JSON.stringify(msg.body)
      } else {
        bodyInit = (msg.body as any) as BodyInit
      }
    }

    // apply HMAC signature if configured
    if (!isGet && this.signer) {
      const payload = typeof bodyInit === "string" ? bodyInit : bodyInit ? Buffer.from(bodyInit as any).toString("utf8") : ""
      const ts = Math.floor(Date.now() / 1000)
      const sig = createHmac(this.signer.algo, this.signer.secret).update(`${ts}.${payload}`).digest("hex")
      headers[this.signer.header] = `${this.signer.algo}=${sig}`
      if (this.signer.timestampHeader) headers[this.signer.timestampHeader] = String(ts)
    }

    // Attempt loop with per-attempt timeout and global abort
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
      const attemptStart = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      // merge external signal
      const cleanupExt = attachAbort(msg.signal, controller)

      try {
        logger.info("Sending webhook", { url, attempt })
        this.hooks.onRequest({ ...msg, url, method, headers }, attempt)

        const res = await fetch(url, {
          method,
          headers,
          body: isGet ? undefined : bodyInit,
          signal: controller.signal,
        })

        clearTimeout(timer)
        cleanupExt()

        const bodyText = await safeReadText(res)
        if (!res.ok && !this.retryOnResponse(res)) {
          // Not OK and not retryable => fail fast
          const err = new Error(`HTTP ${res.status}: ${truncate(bodyText, 200)}`)
          this.hooks.onError(msg, err, attempt)
          throw err
        }

        if (!res.ok && attempt <= this.retries) {
          // retryable response (408/429/5xx)
          const delay = this.computeDelay(attempt, res)
          this.hooks.onRetry(msg, attempt, delay)
          logger.warn("Retrying due to HTTP", { url, status: res.status, attempt, delayMs: delay })
          await sleep(delay)
          continue
        }

        // success!
        const durationMs = Date.now() - attemptStart
        logger.info("Webhook succeeded", { url, status: res.status, attempt, durationMs })
        this.hooks.onSuccess(msg, res.status, attempt, durationMs)

        return {
          status: res.status,
          headers: headersFromResponse(res),
          bodyText,
          attempts: attempt,
          durationMs: Date.now() - started,
        }
      } catch (e: any) {
        clearTimeout(timer)
        cleanupExt()

        const isAbort = e?.name === "AbortError"
        const err = new Error(isAbort ? `Timeout after ${timeoutMs}ms` : String(e?.message ?? e))
        lastError = err

        logger.warn("Webhook attempt failed", { url, attempt, error: err.message })
        this.hooks.onError(msg, err, attempt)

        const shouldRetry = attempt <= this.retries && !isAbort && this.retryOnError(e)
        if (!shouldRetry) break

        const delay = this.computeDelay(attempt)
        this.hooks.onRetry(msg, attempt, delay)
        await sleep(delay)
      }
    }

    logger.error("Webhook failed", { url, error: lastError?.message })
    throw new Error(`WebhookSendout failed: ${lastError?.message ?? "unknown error"}`)
  }

  // --------------------- internals ---------------------

  private validateUrl(u: string): string {
    try {
      const url = new URL(u)
      if (!/^https?:$/.test(url.protocol)) throw new Error("Only http/https are supported")
      return url.toString()
    } catch {
      throw new Error(`Invalid URL: ${u}`)
    }
  }

  private computeDelay(attempt: number, res?: Response): number {
    // Respect Retry-After if present and valid
    if (res) {
      const ra = res.headers.get("retry-after")
      if (ra) {
        const asNum = Number(ra)
        if (Number.isFinite(asNum) && asNum >= 0) {
          return clamp(Math.round(asNum * 1000), 0, this.maxBackoffMs)
        }
        const asDate = Date.parse(ra)
        if (!Number.isNaN(asDate)) {
          const diff = Math.max(0, asDate - Date.now())
          return clamp(diff, 0, this.maxBackoffMs)
        }
      }
    }
    const base = Math.min(this.backoffMs * attempt * attempt, this.maxBackoffMs)
    if (!this.jitter) return base
    return base + Math.floor(Math.random() * 200) // +/- 0..200ms jitter
  }

  private generateIdempotencyKey(): string {
    // 16 bytes base64url
    return randomBytes(16).toString("base64url")
  }
}

/* --------------------- helpers --------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)))
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

function headersFromResponse(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  res.headers.forEach((v, k) => (out[k] = v))
  return out
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ""
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…"
}

/** Tie an external AbortSignal to an internal AbortController */
function attachAbort(external: AbortSignal | undefined, controller: AbortController): () => void {
  if (!external) return () => {}
  if (external.aborted) {
    controller.abort(external.reason)
    return () => {}
  }
  const onAbort = () => controller.abort(external.reason)
  external.addEventListener("abort", onAbort, { once: true })
  return () => external.removeEventListener("abort", onAbort)
}
