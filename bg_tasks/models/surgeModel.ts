import surgeConfig from "./surgeConfig.json"
import { z } from "zod"

export interface SurgeInput {
  timeSeries: Array<{ timestamp: number; change: number }>
}

export interface SurgeConfig {
  windowSize: number
  threshold: number
  momentumFactor: number
  varianceWeight: number
  minConfidence: number
  maxConfidence: number
  backtestPeriod: number
}

const cfgSchema = z.object({
  windowSize: z.number().int().positive(),
  threshold: z.number().finite(),
  momentumFactor: z.number().min(0).max(1),
  varianceWeight: z.number().min(0),
  minConfidence: z.number().min(0).max(1),
  maxConfidence: z.number().min(0).max(1),
  backtestPeriod: z.number().int().positive(),
})

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]
  return s / xs.length
}

function variance(xs: number[], mu?: number): number {
  if (xs.length === 0) return 0
  const m = mu ?? mean(xs)
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - m
    s += d * d
  }
  // population variance for stability on small windows
  return s / xs.length
}

function ema(xs: number[], alpha: number): number {
  if (xs.length === 0) return 0
  let m = xs[0]
  const a = clamp(alpha, 0, 1)
  for (let i = 1; i < xs.length; i++) {
    m = a * xs[i] + (1 - a) * m
  }
  return m
}

/**
 * SurgeModel
 * - Validates config at runtime
 * - Handles short series safely
 * - Uses EMA for momentum and stdev penalty for noise
 * - Confidence is scaled by momentum ratio, noise, and simple backtest hit-rate
 */
export class SurgeModel {
  private cfg: SurgeConfig

  constructor(overrides: Partial<SurgeConfig> = {}) {
    const base = cfgSchema.parse(surgeConfig as SurgeConfig)
    const merged: SurgeConfig = {
      ...base,
      ...overrides,
    }
    this.cfg = cfgSchema.parse(merged)
    if (this.cfg.minConfidence > this.cfg.maxConfidence) {
      // swap if misconfigured
      const min = this.cfg.maxConfidence
      const max = this.cfg.minConfidence
      this.cfg.minConfidence = min
      this.cfg.maxConfidence = max
    }
  }

  /** Update config at runtime (partial) */
  public configure(overrides: Partial<SurgeConfig>): void {
    const next = { ...this.cfg, ...overrides }
    this.cfg = cfgSchema.parse(next)
  }

  get config(): Readonly<SurgeConfig> {
    return this.cfg
  }

  detect(input: SurgeInput): { surge: boolean; confidence: number } {
    const series = Array.isArray(input?.timeSeries) ? input.timeSeries : []
    if (series.length === 0) {
      return { surge: false, confidence: this.cfg.minConfidence }
    }

    // Take the most recent window
    const win = series.slice(-this.cfg.windowSize)
    const changes = win.map(p => {
      const n = Number(p.change)
      return Number.isFinite(n) ? n : 0
    })

    // Momentum via EMA (more robust than raw mean for bursts)
    const mom = ema(changes, this.cfg.momentumFactor)

    // Noise penalty via stdev
    const mu = mean(changes)
    const sig = Math.sqrt(variance(changes, mu))

    // Scoring
    const score = mom - sig * this.cfg.varianceWeight
    const surge = score > this.cfg.threshold

    // Confidence:
    //  - base on momentum vs threshold
    //  - penalize noise
    //  - modulate by simple hit-rate in backtest window (percentage of positive changes)
    const thr = this.cfg.threshold === 0 ? 1e-9 : Math.abs(this.cfg.threshold)
    const base = mom / thr
    const noisePenalty = 1 / (1 + sig) // in (0,1]
    const btSlice = series.slice(-this.cfg.backtestPeriod)
    const hits =
      btSlice.length === 0
        ? 0
        : btSlice.reduce((acc, p) => acc + (p.change > 0 ? 1 : 0), 0) / btSlice.length
    // Compose and clamp
    const rawConf = base * noisePenalty * clamp(hits, 0.25, 1) // floor hit-rate at 0.25 to avoid ultra-low values
    const confidence = clamp(rawConf, this.cfg.minConfidence, this.cfg.maxConfidence)

    return { surge, confidence }
  }
}
