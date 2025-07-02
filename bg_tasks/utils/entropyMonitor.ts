export class EntropyMonitor {
  constructor(private logBase: number = 2) {}

  analyze(values: number[]): number {
    const total = values.reduce((sum, v) => sum + v, 0)
    if (total === 0) return 0
    return -values
      .map(v => v / total)
      .filter(p => p > 0)
      .reduce((e, p) => e + p * Math.log(p) / Math.log(this.logBase), 0)
  }

  normalize(values: number[]): number[] {
    const ent = this.analyze(values)
    const maxEnt = Math.log(values.length) / Math.log(this.logBase)
    return [ent, maxEnt, ent / (maxEnt || 1)]
  }
}