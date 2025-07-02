export interface PatternPoint {
  value: number
  time: number
}

export class PatternDetector {
  detect(points: PatternPoint[]): Array<{ start: number; end: number; strength: number }> {
    const patterns: Array<{ start: number; end: number; strength: number }> = []
    let start = 0
    for (let i = 1; i < points.length; i++) {
      if (points[i].value * points[i - 1].value < 0) {
        const strength = Math.abs(points[i].value - points[start].value)
        patterns.push({ start: points[start].time, end: points[i].time, strength })
        start = i
      }
    }
    return patterns
  }
}
