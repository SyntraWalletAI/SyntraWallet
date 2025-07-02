import surgeConfig from './surgeConfig.json'

export interface SurgeInput {
  timeSeries: Array<{ timestamp: number; change: number }>
}

export class SurgeModel {
  private windowSize = surgeConfig.windowSize
  private threshold = surgeConfig.threshold
  private momentum = surgeConfig.momentumFactor
  private varianceW = surgeConfig.varianceWeight
  private minConf = surgeConfig.minConfidence
  private maxConf = surgeConfig.maxConfidence
  private backtest = surgeConfig.backtestPeriod

  detect(input: SurgeInput): { surge: boolean; confidence: number } {
    const slice = input.timeSeries.slice(-this.windowSize)
    const changes = slice.map(p => p.change)
    const avg = changes.reduce((a, c) => a + c, 0) / this.windowSize
    const variance = changes.reduce((a, c) => a + (c - avg) ** 2, 0) / this.windowSize
    const score = avg * this.momentum - variance * this.varianceW
    const surge = score > this.threshold
    const confBase = avg / this.threshold
    const conf = Math.min(this.maxConf, Math.max(this.minConf, confBase))
    return { surge, confidence: conf }
  }
}
