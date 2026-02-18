import type { CAC } from 'cac'
import type { CommandOptions, DiscoverProgressEvent, ExportProgressEvent } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { resolveConfig } from './config'
import {
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_DOCS,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_PAGE_SIZE,
  NAME,
  VERSION,
} from './constants'
import { discoverDocuments } from './discover'
import { exportMarkdown } from './export'

try {
  const cli: CAC = cac(NAME)
  cli
    .command('', 'Discover linked Feishu documents and export markdown')
    .option('--url <url>', 'Root Feishu document URL')
    .option('--app-id <appId>', 'Feishu app id')
    .option('--app-secret <appSecret>', 'Feishu app secret')
    .option('--debug', 'Enable verbose debug logs')
    .option('--output <output>', `Output directory (default: ${DEFAULT_OUTPUT_DIR})`)
    .option('--manifest <manifest>', `Manifest filename (default: ${DEFAULT_MANIFEST_FILE})`)
    .option('--max-depth <maxDepth>', `Maximum recursive depth (default: ${DEFAULT_MAX_DEPTH})`)
    .option('--max-docs <maxDocs>', `Maximum discovered document count (default: ${DEFAULT_MAX_DOCS})`)
    .option('--page-size <pageSize>', `API page size (default: ${DEFAULT_PAGE_SIZE})`)
    .action(async (options: Partial<CommandOptions>) => {
      p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)

      const config = await resolveConfig(options)

      const discoverResult = await runDiscoverStage(config)
      await mkdir(config.outputDirPath, { recursive: true })
      await writeFile(config.manifestPath, `${JSON.stringify(discoverResult, null, 2)}\n`, 'utf-8')
      p.log.success(`Manifest written to ${config.manifestPath}`)

      const exportResult = await runExportStage(config)

      if (discoverResult.warnings.length > 0)
        p.log.warn(`Discover warnings: ${discoverResult.warnings.length}`)
      if (exportResult.warnings.length > 0)
        p.log.warn(`Export warnings: ${exportResult.warnings.length}`)

      p.log.success(`Markdown files written to ${config.outputDirPath}`)
      p.outro('Done')
    })

  cli.help()
  cli.version(VERSION)
  cli.parse()
}
catch (error) {
  console.error(error)
  process.exit(1)
}

async function runDiscoverStage(options: Awaited<ReturnType<typeof resolveConfig>>) {
  const spinner = p.spinner()
  let hasActiveSpinner = false
  let activeStartedAt = 0
  let activeBaseMessage = ''
  let heartbeatTimer: NodeJS.Timeout | undefined

  try {
    const result = await discoverDocuments({
      url: options.url,
      appId: options.appId,
      appSecret: options.appSecret,
      debug: options.debug,
      maxDepth: options.maxDepth,
      maxDocs: options.maxDocs,
      pageSize: options.pageSize,
      onProgress: (event) => {
        const message = formatDiscoverProgressMessage(event)
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

    if (hasActiveSpinner)
      spinner.stop(`Discovery complete (${result.total} documents)`)
    else
      p.log.step(`Discovery complete (${result.total} documents)`)

    return result
  }
  finally {
    heartbeatTimer = clearSpinnerHeartbeat(heartbeatTimer)
  }
}

async function runExportStage(options: Awaited<ReturnType<typeof resolveConfig>>) {
  const spinner = p.spinner()
  let hasActiveSpinner = false

  const result = await exportMarkdown({
    appId: options.appId,
    appSecret: options.appSecret,
    debug: options.debug,
    pageSize: options.pageSize,
    manifestPath: options.manifestPath,
    outputDirPath: options.outputDirPath,
    onProgress: (event) => {
      const message = formatExportProgressMessage(event)
      if (event.status === 'processing') {
        if (hasActiveSpinner)
          spinner.stop()
        spinner.start(message)
        hasActiveSpinner = true
        return
      }

      if (!hasActiveSpinner) {
        spinner.start(message)
        hasActiveSpinner = true
      }
      spinner.stop(message)
      hasActiveSpinner = false
    },
  })

  if (hasActiveSpinner)
    spinner.stop(`Export complete (${result.written}/${result.total} files)`)
  else
    p.log.step(`Export complete (${result.written}/${result.total} files)`)

  return result
}

function formatDiscoverProgressMessage(event: DiscoverProgressEvent) {
  const marker = markerByStatus(event.status)
  const label = event.status === 'processing'
    ? event.url
    : event.message
  return `${marker} [${event.sequence}] ${label} (depth=${event.depth}, discovered=${event.discovered}, warnings=${event.warnings})`
}

function formatExportProgressMessage(event: ExportProgressEvent) {
  const marker = exportMarkerByStatus(event.status)
  const suffix = event.targetPath ? ` => ${event.targetPath}` : ''
  return `${marker} [${event.sequence}] ${event.message}${suffix} (written=${event.written}, skipped=${event.skipped}, warnings=${event.warnings})`
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

function exportMarkerByStatus(status: ExportProgressEvent['status']) {
  if (status === 'processing')
    return '...'
  if (status === 'success')
    return 'ok'
  if (status === 'skip')
    return 'skip'
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
