export interface AnalysisResult {
  count: number
  average: number
  peak: number
  intervals: Array<{ start: number; end: number; count: number }>
}

export class PulseAnalyzer {
  analyze(events: Array<{ timestamp: number; value: number }>, windowMs: number): AnalysisResult {
    if (!events.length) {
      return { count: 0, average: 0, peak: 0, intervals: [] }
    }

    const sorted = events.slice().sort((a, b) => a.timestamp - b.timestamp)
    const values = sorted.map(e => e.value)
    const count = values.length
    const sum = values.reduce((s, v) => s + v, 0)
    const average = sum / count
    const peak = Math.max(...values)

    const intervals: AnalysisResult['intervals'] = []
    let start = sorted[0].timestamp
    let last = start
    let groupCount = 1

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]
      if (curr.timestamp - last <= windowMs) {
        groupCount++
      } else {
        intervals.push({ start, end: last, count: groupCount })
        start = curr.timestamp
        groupCount = 1
      }
      last = curr.timestamp
    }
    intervals.push({ start, end: last, count: groupCount })

    return { count, average, peak, intervals }
  }

  detectSpikes(events: Array<{ timestamp: number; value: number }>, factor: number): Array<{ timestamp: number; value: number }> {
    const values = events.map(e => e.value)
    const avg = values.reduce((s, v) => s + v, 0) / values.length || 0
    const threshold = avg * factor
    return events.filter(e => e.value >= threshold)
  }
}
