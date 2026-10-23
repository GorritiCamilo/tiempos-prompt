export type PromptTime = {
  n: number
  text: string
  startedAt: number
  // ms acumulados esperando al usuario (preguntas, permisos, aprobar plan)
  waitMs: number
  // ms en que Claude había terminado y esperaba tareas en segundo plano
  bgMs: number
  endedAt: number
  totalMs: number
  tools: number
  isDone: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'tiempos-prompt': { history: PromptTime[]; now: number }
  }
}
