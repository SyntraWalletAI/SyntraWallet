
import { ActionBase, ActionContext } from './actionBase'
import { AlertService } from './alertService'
import { MetricsCache } from './metricsCache'

export class AgentCore {
  private actions = new Map<string, ActionBase>()
  private alerts = new AlertService()
  private metrics = new MetricsCache()
  private plugins: Array<(ctx: ActionContext) => Promise<void>> = []

  register(name: string, action: ActionBase): void {
    this.actions.set(name, action)
  }

  use(plugin: (ctx: ActionContext) => Promise<void>): void {
    this.plugins.push(plugin)
  }

  async run(name: string, context: ActionContext): Promise<any> {
    const action = this.actions.get(name)
    if (!action) throw new Error(`Action not found: ${name}`)
    await Promise.all(this.plugins.map(p => p(context)))
    const start = Date.now()
    const outcome = await action.run(context)
    const duration = Date.now() - start
    this.metrics.add({ key: name, value: duration, timestamp: Date.now() })
    if (!outcome.success) {
      this.alerts.send({ level: 'error', message: `Action ${name} failed`, data: outcome.error })
    }
    return outcome
  }
}
