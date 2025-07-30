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
  /** Duration (ms) of processing */
  durationMs?: number
}

/**
 * Options for batch processing and instrumentation
 */
export interface OuterDataProcessorOptions {
  /** If true, skip invalid events instead of throwing (default: false) */
  skipInvalid?: boolean
  /** Maximum length of payload key list in summary (default: unlimited) */
  maxKeysInSummary?: number
  /** Hooks for lifecycle events */
  hooks?: {
    onBeforeProcess?: (event: OuterEvent) => void
    onAfterProcess?: (result: ProcessedOuterData) => void
    onError?: (event: OuterEvent, error: Error) => void
  }
}

/** Simple structured logger */
const logger = {
  info: (msg: string, meta: any = {}) =>
    console.log({ level: "info", timestamp: new Date().toISOString(), msg, ...meta }),
  warn: (msg: string, meta: any = {}) =>
    console.warn({ level: "warn", timestamp: new Date().toISOString(), msg, ...meta }),
  error: (msg: string, meta: any = {}) =>
    console.error({ level: "error", timestamp: new Date().toISOString(), msg, ...meta }),
}

/**
 * Transforms OuterEvent instances into enriched summaries.
 */
export class OuterDataProcessor {
  private skipInvalid: boolean
  private maxKeysInSummary?: number
  private hooks: Required<OuterDataProcessorOptions>["hooks"]

  constructor(private readonly opts: OuterDataProcessorOptions = {}) {
    this.skipInvalid = opts.skipInvalid ?? false
    this.maxKeysInSummary = opts.maxKeysInSummary
    this.hooks = {
      onBeforeProcess: opts.hooks?.onBeforeProcess ?? (() => {}),
      onAfterProcess:  opts.hooks?.onAfterProcess  ?? (() => {}),
      onError:         opts.hooks?.onError         ?? (() => {}),
    }
  }

  /**
   * Process a single OuterEvent into ProcessedOuterData.
   * @throws Error if event is invalid and skipInvalid=false
   */
  public process(event: OuterEvent): ProcessedOuterData {
    const start = Date.now()
    try {
      this.hooks.onBeforeProcess(event)
      this.validateEvent(event)

      const { id, type, payload, timestamp } = event
      const keys = Object.keys(payload)
      const limited = this.maxKeysInSummary ? keys.slice(0, this.maxKeysInSummary) : keys
      const keyList = limited.join(", ")

      const summary = `Event '${type}' (ID: ${id}) at ${new Date(timestamp).toISOString()} with payload keys: [${keyList}]`
      const result: ProcessedOuterData = {
        eventId: id,
        summary,
        processedAt: Date.now(),
        durationMs: Date.now() - start,
      }

      logger.info("Processed OuterEvent", { eventId: id, durationMs: result.durationMs })
      this.hooks.onAfterProcess(result)
      return result
    } catch (err: any) {
      logger.error("Error processing OuterEvent", { eventId: event?.id, error: err.message })
      this.hooks.onError(event, err)
      if (this.skipInvalid) {
        logger.warn("Skipping invalid event", { eventId: event?.id })
        return {
          eventId: event?.id ?? "<unknown>",
          summary: "Invalid event skipped",
          processedAt: Date.now(),
          durationMs: Date.now() - start,
        }
      }
      throw err
    }
  }

  /**
   * Process an array of OuterEvent, with optional skipping of invalid entries.
   */
  public batchProcess(events: OuterEvent[]): ProcessedOuterData[] {
    const results: ProcessedOuterData[] = []
    for (const evt of events) {
      try {
        results.push(this.process(evt))
      } catch (err: any) {
        if (this.skipInvalid) continue
        throw new Error(`Failed to process event ${evt?.id ?? "<unknown>"}: ${err.message}`)
      }
    }
    return results
  }

  /**
   * Validate core properties of an OuterEvent
   */
  private validateEvent(event: OuterEvent): void {
    if (!event || typeof event !== "object")
      throw new TypeError("Event must be a non-null object")

    const { id, type, payload, timestamp } = event
    if (!id || typeof id !== "string")
      throw new Error("Event.id must be a non-empty string")
    if (!type || typeof type !== "string")
      throw new Error("Event.type must be a non-empty string")
    if (!payload || typeof payload !== "object")
      throw new Error("Event.payload must be an object")
    if (
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0
    ) {
      throw new Error("Event.timestamp must be a positive number")
    }
  }
}
