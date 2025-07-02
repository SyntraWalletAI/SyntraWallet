export interface ActivityPoint {
  timestamp: number
  activity: number
}

export class ActivityMatrix {
  constructor(private resolution: number = 10) {}

  private normalize(values: number[]): number[] {
    const max = Math.max(...values, 1)
    return values.map(v => v / max)
  }

  generate(data: ActivityPoint[]): number[][] {
    const matrix: number[][] = Array.from({ length: this.resolution }, () =>
      Array(this.resolution).fill(0)
    )
    const normActs = this.normalize(data.map(d => d.activity))
    data.forEach((d, i) => {
      const x = Math.floor((d.timestamp % (this.resolution * 1000)) / (this.resolution * 1000) * (this.resolution - 1))
      const y = Math.floor(normActs[i] * (this.resolution - 1))
      matrix[y][x] += 1
    })
    return matrix
  }

  merge(other: number[][]): number[][] {
    const m = this.generate([])
    for (let y = 0; y < this.resolution; y++) {
      for (let x = 0; x < this.resolution; x++) {
        m[y][x] = (m[y][x] || 0) + (other[y]?.[x] || 0)
      }
    }
    return m
  }
}