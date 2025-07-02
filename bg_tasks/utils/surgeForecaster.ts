export interface SurgePoint {
  time: number
  change: number
}

export interface SurgeConfig {
  windowSize: number
  threshold: number
}

export class SurgeForecaster {
  private windowSize: number
  private threshold: number

  constructor(config: Partial<SurgeConfig> = {}) {
    this.windowSize = config.windowSize ?? 5
    this.threshold = config.threshold ?? 0.1
  }

  predict(points: SurgePoint[]): boolean {
    if (points.length < this.windowSize) return false
    const slice = points.slice(-this.windowSize)
    const avg = slice.reduce((acc, p) => acc + p.change, 0) / this.windowSize
    const variance = slice.reduce((acc, p) => acc + Math.pow(p.change - avg, 2), 0) / this.windowSize
    const momentum = avg - Math.sqrt(variance)
    return momentum > this.threshold
  }

  confidence(points: SurgePoint[]): number {
    if (points.length < this.windowSize) return 0
    const slice = points.slice(-this.windowSize)
    const avg = slice.reduce((acc, p) => acc + p.change, 0) / this.windowSize
    return Math.min(1, Math.max(0, avg / this.threshold))
  }
}