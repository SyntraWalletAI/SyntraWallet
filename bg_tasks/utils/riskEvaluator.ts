export interface RiskData {
  volume: number
  liquidity: number
  volatility: number
}

export interface RiskConfig {
  weights: { volume: number; liquidity: number; volatility: number }
  scale: number
  clamp: [number, number]
}

export class RiskEvaluator {
  private weights: { volume: number; liquidity: number; volatility: number }
  private scale: number
  private min: number
  private max: number

  constructor(config: Partial<RiskConfig> = {}) {
    const { weights = { volume: 0.3, liquidity: 0.5, volatility: 0.2 }, scale = 100, clamp = [0, 100] } = config
    this.weights = weights
    this.scale = scale
    this.min = clamp[0]
    this.max = clamp[1]
  }

  private validate(data: RiskData): void {
    if (data.volume < 0 || data.liquidity < 0 || data.volatility < 0) {
      throw new Error('invalid data')
    }
  }

  evaluate(data: RiskData): number {
    this.validate(data)
    const raw = data.volume * this.weights.volume +
                data.liquidity * this.weights.liquidity +
                data.volatility * this.weights.volatility
    const scaled = raw * this.scale
    return Math.min(this.max, Math.max(this.min, scaled))
  }

  combine(other: RiskEvaluator, factor: number): RiskEvaluator {
    const w1 = this.weights, w2 = (other as any).weights
    return new RiskEvaluator({
      weights: {
        volume: w1.volume * (1 - factor) + w2.volume * factor,
        liquidity: w1.liquidity * (1 - factor) + w2.liquidity * factor,
        volatility: w1.volatility * (1 - factor) + w2.volatility * factor
      },
      scale: this.scale,
      clamp: [this.min, this.max]
    })
  }
}