import riskConfig from './riskConfig.json'

export interface RiskInput {
  volume: number
  liquidity: number
  volatility: number
}

export class RiskModel {
  private weights = riskConfig.weights
  private scale = riskConfig.scale
  private clampMin = riskConfig.clamp[0]
  private clampMax = riskConfig.clamp[1]
  private smoothing = riskConfig.smoothingFactor
  private dynamic = riskConfig.dynamicThresholds
  private volAdjust = riskConfig.volatilityAdjustment

  process(data: RiskInput): number {
    const vAdj = this.volAdjust.enabled ? data.volatility * this.volAdjust.multiplier : data.volatility
    const raw = data.volume * this.weights.volume + data.liquidity * this.weights.liquidity + vAdj * this.weights.volatility
    const smoothed = raw * this.smoothing + raw * (1 - this.smoothing)
    const scaled = smoothed * this.scale
    const clamped = Math.min(this.clampMax, Math.max(this.clampMin, scaled))
    if (clamped <= this.dynamic.low) return 0
    if (clamped <= this.dynamic.medium) return 1
    if (clamped <= this.dynamic.high) return 2
    return 3
  }
}
