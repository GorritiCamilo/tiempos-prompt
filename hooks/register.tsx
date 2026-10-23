import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PromptTime } from '../types'

const history = atom({ plugin: 'tiempos-prompt', key: 'history' } as const, [], {
  shape: 'history-2',
})
// Reloj que avanza cada segundo mientras Claude trabaja, para redibujar la banda.
const now = atom({ plugin: 'tiempos-prompt', key: 'now' } as const, 0)

// Herramientas cuya duración entera es tiempo del usuario.
const USER_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'])

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}h${String(m).padStart(2, '0')}m`
  if (m) return `${m}m${String(r).padStart(2, '0')}s`
  return `${r}s`
}

const patchLast = (fn: (p: PromptTime) => PromptTime) => (list: PromptTime[]) =>
  list.length === 0 ? list : [...list.slice(0, -1), fn(list[list.length - 1])]

let ticker: { cancel: () => void } | undefined

function stopTicker() {
  ticker?.cancel()
  ticker = undefined
}

function startTicker($: EngineInterface) {
  stopTicker()
  ticker = $.clock.every(1000, () => {
    void $.clock.now().then(v => update($, now, () => v))
  })
}

export const register: Register = on => {
  // Esperas abiertas (tool_use_id -> inicio), para sumar el tiempo del usuario.
  const waits = new Map<string, number>()
  const asked = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tiempos',
      description: 'Histórico de tiempos de cada prompt de esta sesión',
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const t = await $.clock.now()
    waits.clear()
    asked.clear()
    // Avisos automáticos (tareas en segundo plano, etc.): no son un prompt
    // nuevo, reabren el último y suman el lapso de espera.
    if (/^\s*<(task-notification|system-reminder)/.test(e.text)) {
      await update($, history, patchLast(p =>
        p.isDone ? { ...p, isDone: false, bgMs: p.bgMs + (t - p.endedAt) } : p,
      ))
      await update($, now, () => t)
      startTicker($)
      return next(e)
    }
    await update($, history, list => [
      ...list.map(p => (p.isDone ? p : { ...p, isDone: true, totalMs: t - p.startedAt })),
      {
        n: list.length + 1,
        text: e.text.replace(/\s+/g, ' ').slice(0, 60),
        startedAt: t,
        waitMs: 0,
        bgMs: 0,
        endedAt: t,
        totalMs: 0,
        tools: 0,
        isDone: false,
      },
    ].slice(-200))
    await update($, now, () => t)
    startTicker($)
    return next(e)
  })

  // Un permiso que termina en "ask" muestra el diálogo al usuario.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id) asked.add(e.tool_use_id)
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const t0 = await $.clock.now()
    await update($, history, patchLast(p => ({ ...p, tools: p.tools + 1 })))
    if (USER_TOOLS.has(e.tool)) waits.set(e.tool_use_id, t0)
    const ran = await next(e)
    const t1 = await $.clock.now()
    // Si hubo diálogo de permiso, el lapso del call cuenta como espera del usuario.
    if (waits.has(e.tool_use_id) || asked.has(e.tool_use_id)) {
      const ms = t1 - (waits.get(e.tool_use_id) ?? t0)
      await update($, history, patchLast(p => ({ ...p, waitMs: p.waitMs + ms })))
    }
    waits.delete(e.tool_use_id)
    asked.delete(e.tool_use_id)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    const t = await $.clock.now()
    stopTicker()
    await update($, history, patchLast(p =>
      p.isDone ? p : { ...p, isDone: true, endedAt: t, totalMs: t - p.startedAt },
    ))
    await update($, now, () => t)
    return next(e)
  })

  on('command.run', { command: 'tiempos' }, async $ => {
    const list = await read($, history)
    if (list.length === 0) return { text: 'Todavía no hay prompts en esta sesión.' }
    const t = await $.clock.now()
    let tot = 0
    let wait = 0
    let bg = 0
    const rows = list.map(p => {
      const total = p.isDone ? p.totalMs : t - p.startedAt
      tot += total
      wait += p.waitMs
      bg += p.bgMs
      return `#${String(p.n).padEnd(3)} ${fmt(total).padStart(7)} total | ${fmt(total - p.waitMs - p.bgMs).padStart(7)} Claude | ${fmt(p.waitMs).padStart(7)} vos | ${fmt(p.bgMs).padStart(7)} bg | ${String(p.tools).padStart(3)} tools  ${p.text}`
    })
    rows.push(`Sesión: ${fmt(tot)} total | ${fmt(tot - wait - bg)} Claude | ${fmt(wait)} esperándote | ${fmt(bg)} segundo plano | ${list.length} prompts`)
    return { text: rows.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    if (e.props.hasSurvey || list.length === 0) return next(e)
    const t = await read($, now)
    const p = list[list.length - 1]
    const total = p.isDone ? p.totalMs : Math.max(0, t - p.startedAt)
    const sessionMs = list.reduce((a, x) => a + (x === p ? total : x.totalMs), 0)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={p.isDone ? undefined : 'yellow'} dimColor={p.isDone}>
          {p.isDone ? '✓' : '⏱'} #{p.n} {fmt(total)} total · {fmt(total - p.waitMs - p.bgMs)} Claude ·{' '}
          {fmt(p.waitMs)} esperándote ·{p.bgMs ? ` ${fmt(p.bgMs)} segundo plano ·` : ''} {p.tools} tools │ sesión {fmt(sessionMs)} ({list.length}) · /tiempos
        </Text>
      </Box>
    )
  })
}
