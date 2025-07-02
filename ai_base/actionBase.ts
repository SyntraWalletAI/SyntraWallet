
export interface ActionContext {
  payload: any
  metadata: { source: string; timestamp: number }
}

export abstract class ActionBase {
  abstract execute(context: ActionContext): Promise<any>

  protected validate(context: ActionContext): void {
    if (!context.payload) {
      throw new Error('Payload missing')
    }
    if (!context.metadata || typeof context.metadata.timestamp !== 'number') {
      throw new Error('Invalid metadata')
    }
  }

  async run(context: ActionContext): Promise<any> {
    this.validate(context)
    try {
      const result = await this.execute(context)
      return { success: true, result }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
}
