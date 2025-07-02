export interface ExecutionTask {
  execute: () => Promise<any>
  priority: number
}

export class ExecutionEngine {
  private queue: ExecutionTask[] = []

  schedule(task: ExecutionTask): void {
    this.queue.push(task)
    this.queue.sort((a, b) => b.priority - a.priority)
  }

  async runAll(): Promise<any[]> {
    const results: any[] = []
    while (this.queue.length) {
      const task = this.queue.shift()!
      results.push(await task.execute())
    }
    return results
  }
}
