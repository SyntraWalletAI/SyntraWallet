import type { PriceAlert } from "./PriceWatcher"

export interface AlertRule {
  symbol: string
  minChangePct: number
}

export interface ManagedAlert {
  rule: AlertRule
  lastTriggered: number
  triggerCount: number
}

export interface AlertManagerOptions {
  /** cooldown window per symbol in milliseconds, default 60_000 */
  cooldownMs?: number
  /** optional custom symbol normalizer, default uppercasing + trim */
  normalizeSymbol?: (s: string) => string
  /** optional clock for testing */
  now?: () => number
}

export interface AlertEvaluationOptions {
  /** bypass cooldown checks for this evaluation */
  force?: boolean
}

/**
 * Manages alert rules and decides when to dispatch notifications
 * - per symbol cooldown
 * - symbol normalization
 * - trigger counting and rule management helpers
 */
export class AlertManager {
  private managed = new Map<string, ManagedAlert>()
  private cooldownMs: number
  private normalize: (s: string) => string
  private now: () => number

  constructor(opts: AlertManagerOptions = {}) {
    this.cooldownMs = Math.max(0, opts.cooldownMs ?? 60_000)
    this.normalize =
      opts.normalizeSymbol ??
      ((s: string) => String(s || "").trim().toUpperCase())
    this.now = opts.now ?? (() => Date.now())
  }

  /** Add or replace an alert rule */
  addRule(rule: AlertRule): void {
    const key = this.normalize(rule.symbol)
    const normalized: AlertRule = { symbol: key, minChangePct: Number(rule.minChangePct) }
    this.managed.set(key, {
      rule: normalized,
      lastTriggered: 0,
      triggerCount: this.managed.get(key)?.triggerCount ?? 0,
    })
  }

  /** Update an existing rule, returns false if it did not exist */
  updateRule(symbol: string, patch: Partial<AlertRule>): boolean {
    const key = this.normalize(symbol)
    const current = this.managed.get(key)
    if (!current) return false
    const nextRule: AlertRule = {
      symbol: patch.symbol ? this.normalize(patch.symbol) : current.rule.symbol,
      minChangePct:
        typeof patch.minChangePct === "number"
          ? patch.minChangePct
          : current.rule.minChangePct,
    }
    this.managed.set(nextRule.symbol, {
      rule: nextRule,
      lastTriggered: current.lastTriggered,
      triggerCount: current.triggerCount,
    })
    if (nextRule.symbol !== key) this.managed.delete(key)
    return true
  }

  /** Add if missing, otherwise update existing rule */
  upsertRule(rule: AlertRule): void {
    if (!this.updateRule(rule.symbol, rule)) this.addRule(rule)
  }

  /** Returns a shallow copy of a rule if present */
  getRule(symbol: string): AlertRule | null {
    const key = this.normalize(symbol)
    const ma = this.managed.get(key)
    return ma ? { ...ma.rule } as AlertRule : null
  }

  /** Check if a rule exists */
  hasRule(symbol: string): boolean {
    return this.managed.has(this.normalize(symbol))
  }

  /** Remove an alert rule by symbol */
  removeRule(symbol: string): boolean {
    return this.managed.delete(this.normalize(symbol))
  }

  /** Remove all rules */
  clear(): void {
    this.managed.clear()
  }

  /** List active rules */
  listRules(): AlertRule[] {
    return Array.from(this.managed.values()).map((m) => ({ ...m.rule }))
  }

  /** Get internal stats for a symbol */
  getStats(symbol: string): { lastTriggered: number; triggerCount: number } | null {
    const ma = this.managed.get(this.normalize(symbol))
    return ma ? { lastTriggered: ma.lastTriggered, triggerCount: ma.triggerCount } : null
  }

  /** Set cooldown globally or per call via options */
  setCooldownMs(ms: number): void {
    this.cooldownMs = Math.max(0, ms | 0)
  }

  /**
   * Process a single PriceAlert, returns true if notification should fire
   * Respects per symbol cooldown unless options.force is true
   */
  handleAlert(alert: PriceAlert, options: AlertEvaluationOptions = {}): boolean {
    const key = this.normalize(alert.symbol)
    const ma = this.managed.get(key)
    if (!ma) return false

    const now = alert.timestamp ?? this.now()
    const elapsed = now - ma.lastTriggered

    if (!options.force && elapsed < this.cooldownMs) return false

    const shouldFire = this.shouldTrigger(ma.rule, alert)
    if (shouldFire) {
      ma.lastTriggered = now
      ma.triggerCount += 1
      return true
    }
    return false
  }

  /**
   * Process multiple alerts and return the list that should fire
   * Deduplicates by symbol, keeping the first firing alert per symbol in this batch
   */
  handleBatch(alerts: PriceAlert[], options: AlertEvaluationOptions = {}): PriceAlert[] {
    const fired: PriceAlert[] = []
    const seen = new Set<string>()

    for (const alert of alerts) {
      const key = this.normalize(alert.symbol)
      if (seen.has(key)) continue
      if (this.handleAlert(alert, options)) {
        fired.push(alert)
        seen.add(key)
      }
    }
    return fired
  }

  /** Serialize rules and state to JSON-friendly snapshot */
  toJSON(): {
    cooldownMs: number
    rules: ManagedAlert[]
  } {
    return {
      cooldownMs: this.cooldownMs,
      rules: Array.from(this.managed.values()).map((m) => ({
        rule: { ...m.rule },
        lastTriggered: m.lastTriggered,
        triggerCount: m.triggerCount,
      })),
    }
  }

  /** Restore from a snapshot */
  static fromJSON(snapshot: {
    cooldownMs?: number
    rules?: ManagedAlert[]
  }, opts: AlertManagerOptions = {}): AlertManager {
    const mgr = new AlertManager({ ...opts, cooldownMs: snapshot.cooldownMs ?? opts.cooldownMs })
    for (const m of snapshot.rules ?? []) {
      const key = mgr.normalize(m.rule.symbol)
      mgr.managed.set(key, {
        rule: { symbol: key, minChangePct: m.rule.minChangePct },
        lastTriggered: m.lastTriggered ?? 0,
        triggerCount: m.triggerCount ?? 0,
      })
    }
    return mgr
  }

  // ---------- internals ----------

  private shouldTrigger(rule: AlertRule, alert: PriceAlert): boolean {
    const change = Number(alert.changePct)
    if (!Number.isFinite(change)) return false
    const threshold = Number(rule.minChangePct)
    if (!Number.isFinite(threshold) || threshold < 0) return false
    return Math.abs(change) >= threshold
  }
}

/*
filename options
- alert_manager.ts
- price_alert_manager.ts
- alert_rules_engine.ts
*/
