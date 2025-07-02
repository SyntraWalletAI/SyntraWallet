

import type { OuterEvent } from "./OuterEventWatcher"

export interface ProcessedOuterData {
  eventId: string
  summary: string
  processedAt: number
}


export class OuterDataProcessor {
  /**
   * Transform a single OuterEvent into a ProcessedOuterData.
   */
  process(event: OuterEvent): ProcessedOuterData {
    const { id, type, payload, timestamp } = event
    const keys = Object.keys(payload).join(", ")
    const summary = `Event ${type} with payload keys: [${keys}] at original ${new Date(timestamp).toISOString()}`
    return {
      eventId: id,
      summary,
      processedAt: Date.now(),
    }
  }

  /**
   * Batch process multiple events.
   */
  batchProcess(events: OuterEvent[]): ProcessedOuterData[] {
    return events.map(evt => this.process(evt))
  }
}
