import { EventEmitter } from "events"
import { z } from "zod"
import { ActionBase, ActionContext, ActionResult } from "./actionBase"
import { AlertService, AlertLevel } from "./alertService"
import { MetricsCache } from "./metricsCache"

/* ----------------------------- Schemas & Types ----------------------------- */

const runParamsSchema = z.object({
  name: z.string().min(1),
  context: z.record(z.unknown()).optional(),
})

export type PluginFn = (ctx: ActionContext) => Promise<void> // legacy plugin (no next)
export type Middleware = (ctx: ActionContext, next: () => Promise<void>) => Promise<void>

export interface RunOptions {
  /** Max time allowed for the full pipeline + action */
  timeoutMs?: number
  /** Retry count on failure (0 = no retry). Default 0. */
  retries?: number
  /** Abort controller support */
  signal?: AbortSignal
  /** Called before each retry with (error, attemptNumber) */
  onRetry?: (err: unknown, attempt: number) => void
}

export interface RunMeta {
  name: string
  startedAt: number
  endedAt: number
  durationMs: number
  attempts: number
}

export type AgentCoreEvents = {
  beforeRun: (payload: { name: string; ctx: ActionContext }) => void
  afterRun: (payload: { name: string; outcome: ActionResult; duration: number }) => void
  error: (err: Error) => void
}

/* --------------------------------- Helpers -------------------------------- */

function toMiddleware(fn: PluginFn): Middleware {
  return async (ctx, next) => {
    await fn(ctx)
    await next()
  }
}

function compose(middlewares: Middleware[]): Middleware {
  return function (ctx: ActionContext, next: () => Promise<void>) {
    let index = -1
    const dispatch = (i: number): Promise<void> => {
      if (i <= index) return Promise.reject(new Error("next() called multiple times"))
      index = i
      const fn = i === middlewares.length ? next : middlewares[i]
      if (!fn) return Promise.resolve()
      return Promise.resolve(fn(ctx, () => dispatch(i + 1)))
    }
    return dispatch(0)
  }
}

async function withTimeout<T>(work: () => Promise<T>, ms?: number, signal?: AbortSignal): Promise<T> {
  if (!ms && !signal) return work()
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: any

    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error("Invocation aborted"))
    }

    if (ms && ms > 0) {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`Invocation timed out after ${ms}ms`))
      }, ms)
    }

    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener("abort", onAbort, { once: true })
    }

    work()
      .then((v) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (signal) signal.removeEventListener("abort", onAbort)
        resolve(v)
      })
      .catch((e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (signal) signal.removeEventListener("abort", onAbort)
        reject(e)
      })
  })
}

/* --------------------------------- AgentCore -------------------------------- */

export class AgentCore extends EventEmitter {
  private actions = new Map<string, ActionBase>()
  private alerts = new AlertService()
  private metrics = new MetricsCache()
  private middlewares: Middleware[] = []

  /** Register a named action (overwrites if already present) */
  register(name: string, action: ActionBase): void {
    if (!name || typeof name !== "string") throw new Error("Action name must be a non-empty string")
    if (!action || typeof action.run !== "function") throw new Error(`Action "${name}" must implement run(ctx)`)
    this.actions.set(name, action)
  }

  /** Remove a registered action; returns true if removed */
  unregister(name: string): boolean {
    return this.actions.delete(name)
  }

  /** Check whether an action exists */
  has(name: string): boolean {
    return this.actions.has(name)
  }

  /** Add a legacy plugin (no next) or modern middleware (with next) */
  use(plugin: PluginFn | Middleware): void {
    const mw = (plugin as Middleware).length >= 2 ? (plugin as Middleware) : toMiddleware(plugin as PluginFn)
    this.middlewares.push(mw)
  }

  /** List registered action names */
  listActions(): string[] {
    return Array.from(this.actions.keys())
  }

  /**
   * Run an action by name with the given context and options.
   * Emits: 'beforeRun', 'afterRun', 'error'
   * Returns exactly what the action returns (ActionResult).
   */
  public async run(rawParams: unknown, options: RunOptions = {}): Promise<ActionResult> {
    const { result } = await this.runWithMeta(rawParams, options)
    return result
  }

  /** Run and also return metadata */
  public async runWithMeta(
    rawParams: unknown,
    options: RunOptions = {}
  ): Promise<{ result: ActionResult; meta: RunMeta }> {
    const { name, context = {} } = runParamsSchema.parse(rawParams)
    const action = this.actions.get(name)
    if (!action) {
      const err = new Error(`Action not found: ${name}`)
      this.emit("error", err)
      throw err
    }

    const ctx: ActionContext = { ...context }
    this.emit("beforeRun", { name, ctx })

    const pipeline = compose(this.middlewares)
    const startedAt = Date.now()
    let attempts = 0

    const execOnce = async (): Promise<ActionResult> => {
      attempts++
      let outcome: ActionResult | undefined
      // Run middleware chain then action
      await pipeline(ctx, async () => {
        outcome = await action.run(ctx)
      })

      // Guard: ensure action produced an outcome
      if (!outcome) outcome = { success: false, error: "Action produced no result" }
      return outcome
    }

    const retries = Math.max(0, options.retries ?? 0)
    let outcome: ActionResult = { success: false, error: "Unknown error" }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        outcome = await withTimeout(execOnce, options.timeoutMs, options.signal)
        break
      } catch (err: any) {
        outcome = { success: false, error: err?.message ?? String(err) }
        if (attempt < retries) {
          options.onRetry?.(err, attempt + 1)
          continue
        }
      }
    }

    const duration = Date.now() - startedAt
    this.metrics.add({ key: name, value: duration, timestamp: Date.now() })

    if (!outcome.success) {
      this.alerts.send({
        level: AlertLevel.Error,
        message: `Action '${name}' failed`,
        data: outcome.error,
      })
      // Also emit 'error' for external observers
      this.emit("error", new Error(outcome.error ?? `Action '${name}' failed`))
    }

    this.emit("afterRun", { name, outcome, duration })

    const meta: RunMeta = {
      name,
      startedAt,
      endedAt: startedAt + duration,
      durationMs: duration,
      attempts,
    }

    return { result: outcome, meta }
  }

  /* -------------------------- Typed Event Overrides -------------------------- */

  public override on<K extends keyof AgentCoreEvents>(event: K, listener: AgentCoreEvents[K]): this {
    // @ts-expect-error EventEmitter generic typing
    return super.on(event, listener)
  }
  public override off<K extends keyof AgentCoreEvents>(event: K, listener: AgentCoreEvents[K]): this {
    // @ts-expect-error EventEmitter generic typing
    return super.off(event, listener)
  }
  public override once<K extends keyof AgentCoreEvents>(event: K, listener: AgentCoreEvents[K]): this {
    // @ts-expect-error EventEmitter generic typing
    return super.once(event, listener)
  }
}
