
import type { FlowSummary } from "./AssetFlowAnalyzer"
import fs from "fs"
import path from "path"

export interface ReportOptions {
  format: "json" | "csv"
  outputDir: string
}

/**
 * Generates and saves a report from flow summaries.
 */
export class AssetFlowReportGenerator {
  constructor(private summaries: FlowSummary[]) {}

  async generate(opts: ReportOptions): Promise<string> {
    await fs.promises.mkdir(opts.outputDir, { recursive: true })
    if (opts.format === "json") {
      const file = path.join(opts.outputDir, "flowReport.json")
      await fs.promises.writeFile(file, JSON.stringify(this.summaries, null, 2))
      return file
    } else {
      const header = "token,totalIn,totalOut\n"
      const lines = this.summaries
        .map(s => `${s.token},${s.totalIn},${s.totalOut}`)
        .join("\n")
      const file = path.join(opts.outputDir, "flowReport.csv")
      await fs.promises.writeFile(file, header + lines)
      return file
    }
  }
}