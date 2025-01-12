import { Context, Logger, remove, z } from 'koishi'
import { createHmac } from 'node:crypto'

const LOGGER_NAME = 'logger:lark-webhook'

export interface Config {
  url: string
  secret: string
  title: string
  types: Logger.Type[]
}

export const Config: z<Config> = z.object({
  url: z.string().role('link').description('Lark webhook URL'),
  secret: z.string().role('secret').description('Lark webhook secret'),
  title: z.string(),
  types: z.array(z.union(['success', 'error', 'warn', 'info', 'debug'])).role('checkbox')
    .default(['error', 'warn'])
    .description('Filter log types to send'),
})

export const inject = ['http']

export async function apply(ctx: Context, config: Config) {
  const stripAnsi = await import('strip-ansi')

  const target: Logger.Target = {
    colors: 0,
    async record(record) {
      if (record.name === LOGGER_NAME) return
      if (!config.types.includes(record.type)) return
      try {
        const timestamp = '' + Math.round(Date.now() / 1000)
        const sign = createHmac('sha256', `${timestamp}\n${config.secret}`).digest('base64')
        const response = await ctx.http.post(config.url, {
          timestamp,
          sign,
          msg_type: 'interactive',
          card: {
            elements: [{
              tag: 'markdown',
              content: `\`\`\`\n${stripAnsi.default(record.content)}\n\`\`\``,
            }],
            header: {
              template: record.type === 'error' ? 'red' : 'yellow',
              title: config.title ? {
                content: `${config.title} (${record.name})`,
                tag: 'plain_text',
              } : undefined,
            },
          },
        })
        if (response.code) {
          ctx.logger(LOGGER_NAME).error(`[${response.code}] ${response.msg}`)
        }
      } catch (error) {
        ctx.logger(LOGGER_NAME).error(error)
      }
    },
  }

  ctx.effect(() => {
    Logger.targets.push(target)
    return () => remove(Logger.targets, target)
  })
}
