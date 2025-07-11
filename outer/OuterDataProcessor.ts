/**
 * Process and transform OuterEvent objects into a structured format.
 */
import type { OuterEvent } from "./OuterEventWatcher"

/**
 * Output of processing an OuterEvent
 */
export interface ProcessedOuterData {
  /** Unique identifier of the event */
  eventId: string
  /** Human-readable summary of the event payload */
  summary: string
  /** Timestamp (ms) when processing occurred */
  processedAt: number
}

/**
 * Options for batch processing
 */
export interface OuterDataProcessorOptions {
  /** If true, skip invalid events instead of throwing (default: false) */
  skipInvalid?: boolean
  /** Maximum length of payload key list in summary (default: unlimited) */
  maxKeysInSummary?: number
}

/**
 * Transforms OuterEvent instances into enriched summaries.
 */
export class OuterDataProcessor {
  constructor(private readonly opts: OuterDataProcessorOptions = {}) {}

  /**
   * Process a single OuterEvent into ProcessedOuterData.
   * @throws Error if event is invalid and skipInvalid=false
   */
  public process(event: OuterEvent): ProcessedOuterData {
    this.validateEvent(event)
    const { id, type, payload, timestamp } = event
    const keys = Object.keys(payload)
    const limitedKeys = this.opts.maxKeysInSummary
      ? keys.slice(0, this.opts.maxKeysInSummary)
      : keys
    const keyList = limitedKeys.join(", ")

    const summary = `Event '${type}' (ID: ${id}) at ${new Date(
      timestamp
    ).toISOString()} with payload keys: [${keyList}]`

    return {
      eventId: id,
      summary,
      processedAt: Date.now(),
    }
  }

  /**
   * Process an array of OuterEvent, with optional skipping of invalid entries.
   */
  public batchProcess(
    events: OuterEvent[]
  ): ProcessedOuterData[] {
    const results: ProcessedOuterData[] = []
    for (const evt of events) {
      try {
        results.push(this.process(evt))
      } catch (err: any) {
        if (this.opts.skipInvalid) continue
        throw new Error(
          `Failed to process event ${evt?.id ?? "<unknown>"}: ${err.message}`
        )
      }
    }
    return results
  }

  /**
   * Validate core properties of an OuterEvent
   */
  private validateEvent(event: OuterEvent): void {
    if (!event || typeof event !== "object") {
      throw new TypeError("Event must be a non-null object")
    }
    const { id, type, payload, timestamp } = event
    if (!id || typeof id !== "string") {
      throw new Error("Event.id must be a non-empty string")
    }
    if (!type || typeof type !== "string") {
      throw new Error("Event.type must be a non-empty string")
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Event.payload must be an object")
    }
    if (
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0
    ) {
      throw new Error("Event.timestamp must be a positive number")
    }
  }
}
