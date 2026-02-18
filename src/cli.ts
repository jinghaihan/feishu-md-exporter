import type { CAC } from 'cac'
import type { CommandOptions, DiscoverProgressEvent } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { dirname } from 'pathe'
import { resolveConfig } from './config'
import {
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_DOCS,
  DEFAULT_OUTPUT_FILE,
  DEFAULT_PAGE_SIZE,
  NAME,
  VERSION,
} from './constants'
import { discoverDocuments } from './discover'

try {
  const cli: CAC = cac(NAME)
  cli
    .option('--url <url>', 'Root Feishu document URL')
    .option('--app-id <appId>', 'Feishu app id')
    .option('--app-secret <appSecret>', 'Feishu app secret')
    .option('--debug', 'Enable verbose debug logs')
    .option('--output <output>', `Output JSON file path (default: ${DEFAULT_OUTPUT_FILE})`)
    .option('--max-depth <maxDepth>', `Maximum recursive depth (default: ${DEFAULT_MAX_DEPTH})`)
    .option('--max-docs <maxDocs>', `Maximum discovered document count (default: ${DEFAULT_MAX_DOCS})`)
    .option('--page-size <pageSize>', `API page size (default: ${DEFAULT_PAGE_SIZE})`)

  cli
    .command('', 'Recursively discover linked Feishu documents')
    .action(async (options: Partial<CommandOptions>) => {
      p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)

      const config = await resolveConfig(options)
      const spinner = p.spinner()
      let hasActiveSpinner = false
      let activeStartedAt = 0
      let activeBaseMessage = ''
      let heartbeatTimer: NodeJS.Timeout | undefined

      try {
        const result = await discoverDocuments({
          url: config.url,
          appId: config.appId,
          appSecret: config.appSecret,
          debug: config.debug,
          maxDepth: config.maxDepth,
          maxDocs: config.maxDocs,
          pageSize: config.pageSize,
          onProgress: (event) => {
            const message = formatProgressMessage(event)
            if (event.status === 'processing') {
              if (hasActiveSpinner)
                spinner.stop()
              activeStartedAt = Date.now()
              activeBaseMessage = message
              spinner.start(withElapsedSeconds(activeBaseMessage, activeStartedAt))
              hasActiveSpinner = true
              heartbeatTimer = startSpinnerHeartbeat(spinner, activeBaseMessage, () => activeStartedAt, heartbeatTimer)
              return
            }

            if (!hasActiveSpinner) {
              spinner.start(message)
              hasActiveSpinner = true
            }

            spinner.stop(message)
            hasActiveSpinner = false
            activeBaseMessage = ''
            activeStartedAt = 0
            heartbeatTimer = clearSpinnerHeartbeat(heartbeatTimer)
          },
        })

        await mkdir(dirname(config.outputPath), { recursive: true })
        await writeFile(config.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8')

        if (hasActiveSpinner)
          spinner.stop(`Discovery complete (${result.total} documents)`)
        else
          p.log.step(`Discovery complete (${result.total} documents)`)

        if (result.warnings.length > 0)
          p.log.warn(`${result.warnings.length} warning(s), check output file for details`)

        p.log.success(`Manifest written to ${config.outputPath}`)
        p.outro('Done')
      }
      finally {
        heartbeatTimer = clearSpinnerHeartbeat(heartbeatTimer)
      }
    })

  cli.help()
  cli.version(VERSION)
  cli.parse()
}
catch (error) {
  console.error(error)
  process.exit(1)
}

function formatProgressMessage(event: DiscoverProgressEvent) {
  const marker = markerByStatus(event.status)
  const label = event.status === 'processing'
    ? event.url
    : event.message
  return `${marker} [${event.sequence}] ${label} (depth=${event.depth}, discovered=${event.discovered}, warnings=${event.warnings})`
}

function markerByStatus(status: DiscoverProgressEvent['status']) {
  if (status === 'processing')
    return '...'
  if (status === 'success')
    return 'ok'
  if (status === 'skip')
    return 'skip'
  if (status === 'warning')
    return 'warn'
  return 'err'
}

function withElapsedSeconds(message: string, startedAt: number) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  return `${message}, elapsed=${elapsedSeconds}s`
}

function startSpinnerHeartbeat(
  spinner: ReturnType<typeof p.spinner>,
  baseMessage: string,
  getStartedAt: () => number,
  timer: NodeJS.Timeout | undefined,
) {
  if (timer)
    clearInterval(timer)

  return setInterval(() => {
    const startedAt = getStartedAt()
    if (!startedAt)
      return
    spinner.message(withElapsedSeconds(baseMessage, startedAt))
  }, 1000)
}

function clearSpinnerHeartbeat(timer: NodeJS.Timeout | undefined) {
  if (timer)
    clearInterval(timer)
  return undefined
}
