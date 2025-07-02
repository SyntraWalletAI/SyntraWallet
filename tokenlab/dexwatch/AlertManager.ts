
import type { PriceAlert } from "./PriceWatcher"

export interface AlertRule {
  symbol: string
  minChangePct: number
}

export interface ManagedAlert {
  rule: AlertRule
  lastTriggered: number
}

/**
 * Manages alert rules and dispatches notifications.
 */
export class AlertManager {
  private managed = new Map<string, ManagedAlert>()

  /**
   * Add or update an alert rule.
   */
  addRule(rule: AlertRule): void {
    this.managed.set(rule.symbol, { rule, lastTriggered: 0 })
  }

  /**
   * Process a PriceAlert, returns true if notification should fire.
   */
  handleAlert(alert: PriceAlert): boolean {
    const ma = this.managed.get(alert.symbol)
    if (!ma) return false

    const now = alert.timestamp
    const elapsed = now - ma.lastTriggered
    // throttle: only one alert per symbol per minute
    if (elapsed < 60_000) return false

    if (Math.abs(alert.changePct) >= ma.rule.minChangePct) {
      ma.lastTriggered = now
      return true
    }
    return false
  }

  /**
   * List active alert rules.
   */
  listRules(): AlertRule[] {
    return Array.from(this.managed.values()).map(m => m.rule)
  }

  /**
   * Remove an alert rule by symbol.
   */
  removeRule(symbol: string): boolean {
    return this.managed.delete(symbol)
  }
}