
export interface Transfer {
  token: string
  from: string
  to: string
  amount: number
}


export class TokenGrouper {
  static group(transfers: Transfer[]): Array<{
    token: string
    totalAmount: number
    uniqueSenders: number
    uniqueReceivers: number
  }> {
    const map: Record<string, { amount: number; senders: Set<string>; receivers: Set<string> }> = {}
    for (const t of transfers) {
      if (!map[t.token]) {
        map[t.token] = { amount: 0, senders: new Set(), receivers: new Set() }
      }
      map[t.token].amount += t.amount
      map[t.token].senders.add(t.from)
      map[t.token].receivers.add(t.to)
    }
    return Object.entries(map).map(([token, data]) => ({
      token,
      totalAmount: data.amount,
      uniqueSenders: data.senders.size,
      uniqueReceivers: data.receivers.size,
    }))
  }
}