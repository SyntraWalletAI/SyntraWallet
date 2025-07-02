// sendout/WebhookSendout.ts

export interface WebhookMessage {
  url: string
  method?: "POST" | "PUT" | "PATCH"
  headers?: Record<string, string>
  body: any
  timeoutMs?: number
}

/**
 * Sends JSON payloads to HTTP webhooks.
 */
export class WebhookSendout {
  /**
   * Send a webhook request.
   */
  async send(msg: WebhookMessage): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), msg.timeoutMs ?? 10000)
    try {
      const res = await fetch(msg.url, {
        method: msg.method ?? "POST",
        headers: { "Content-Type": "application/json", ...(msg.headers || {}) },
        body: JSON.stringify(msg.body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Webhook error ${res.status}: ${text}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
