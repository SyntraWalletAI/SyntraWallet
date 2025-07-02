export interface TransactionPoint {
  timestamp: number
  amount: number
  fee: number
}

export class ActivityAnalyzer {
  analyze(points: TransactionPoint[]): { totalVolume: number; averageFee: number; peakHour: number } {
    const volumeByHour: Record<number, number> = {}
    let totalVolume = 0
    let totalFee = 0
    points.forEach(p => {
      const hour = new Date(p.timestamp).getUTCHours()
      volumeByHour[hour] = (volumeByHour[hour] || 0) + p.amount
      totalVolume += p.amount
      totalFee += p.fee
    })
    const averageFee = points.length ? totalFee / points.length : 0
    const peakHour = Object.entries(volumeByHour).reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    return { totalVolume, averageFee, peakHour: Number(peakHour) }
  }
}
