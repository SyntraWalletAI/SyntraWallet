import { EventEmitter } from 'events'
import { z } from 'zod'
import { ActionBase, ActionContext, ActionResult } from './actionBase'
import { AlertService, AlertLevel } from './alertService'
import { MetricsCache } from './metricsCache'

// Schema to validate action run parameters
const runParamsSchema = z.object({
  name: z.string().min(1),
  context: z.record(z.any()).optional(),
})

export class AgentCore extends EventEmitter {
  private actions = new Map<string, ActionBase>()
  private alerts = new AlertService()
  private metrics = new MetricsCache()
  private plugins: Array<(ctx: ActionContext) => Promise<void>> = []

  /** Register a named action */
  register(name: string, action: ActionBase): void {
    if (this.actions.has(name)) {
      throw new Error(`Action already registered: ${name}`)
    }
    this.actions.set(name, action)
  }

  /** Add a plugin to run before each action */
  use(plugin: (ctx: ActionContext) => Promise<void>): void {
    this.plugins.push(plugin)
  }

  /**
   * Run an action by name with the given context.
   * Emits events: 'beforeRun', 'afterRun', 'error'
   */
  public async run(rawParams: unknown): Promise<ActionResult> {
    const { name, context = {} } = runParamsSchema.parse(rawParams)
    const action = this.actions.get(name)
    if (!action) {
      const err = new Error(`Action not found: ${name}`)
      this.emit('error', err)
      throw err
    }

    const ctx: ActionContext = { ...context }
    this.emit('beforeRun', { name, ctx })

    // Execute plugins in sequence, capturing errors
    for (const plugin of this.plugins) {
      try {
        await plugin(ctx)
      } catch (pluginErr) {
        this.alerts.send({
          level: AlertLevel.Warn,
          message: `Plugin error before action '${name}'`,
          data: String(pluginErr),
        })
      }
    }

    const start = Date.now()
    let outcome: ActionResult

    try {
      outcome = await action.run(ctx)
    } catch (actionErr: any) {
      outcome = { success: false, error: actionErr.message }
    }

    const duration = Date.now() - start
    this.metrics.add({ key: name, value: duration, timestamp: Date.now() })

    // Send alert on failure
    if (!outcome.success) {
      this.alerts.send({
        level: AlertLevel.Error,
        message: `Action '${name}' failed`,
        data: outcome.error,
      })
    }

    this.emit('afterRun', { name, outcome, duration })
    return outcome
  }
}
