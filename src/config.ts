import type { CommandOptions, ResolvedOptions } from './types'
import process from 'node:process'
import { resolve } from 'pathe'
import { createConfigLoader } from 'unconfig'
import {
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_DOCS,
  DEFAULT_OPTIONS,
  DEFAULT_OUTPUT_FILE,
  DEFAULT_PAGE_SIZE,
  NAME,
} from './constants'
import { loadEnvFiles, normalizeConfig, requiredString, toBoolean, toIntegerInRange, toPositiveInt } from './utils'

export async function resolveConfig(options: Partial<CommandOptions>): Promise<ResolvedOptions> {
  const defaults = structuredClone(DEFAULT_OPTIONS)
  options = normalizeConfig(options)
  const cwd = options.cwd || process.cwd()
  loadEnvFiles(cwd)

  const configOptions = await readConfig(options)
  const envOptions = {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    debug: process.env.FEISHU_DEBUG,
    pageSize: process.env.FEISHU_PAGE_SIZE,
  } satisfies Partial<CommandOptions>
  const merged = { ...defaults, ...configOptions, ...envOptions, ...options, cwd }

  return resolveOptions(merged)
}

export async function readConfig(options: Partial<CommandOptions>) {
  const loader = createConfigLoader<CommandOptions>({
    sources: [
      {
        files: [`${NAME}.config`],
        extensions: ['ts'],
      },
    ],
    cwd: options.cwd || process.cwd(),
    merge: false,
  })
  const config = await loader.load()
  return config.sources.length ? normalizeConfig(config.config) : {}
}

function resolveOptions(options: Partial<CommandOptions>): ResolvedOptions {
  const baseOptions: Required<CommandOptions> = {
    cwd: options.cwd || process.cwd(),
    url: requiredString(options.url, 'url'),
    appId: requiredString(options.appId, 'app-id'),
    appSecret: requiredString(options.appSecret, 'app-secret'),
    debug: options.debug ?? false,
    output: options.output || DEFAULT_OUTPUT_FILE,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxDocs: options.maxDocs ?? DEFAULT_MAX_DOCS,
    pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
  }

  return {
    ...baseOptions,
    debug: toBoolean(baseOptions.debug, false, '--debug'),
    outputPath: resolve(baseOptions.cwd, baseOptions.output),
    maxDepth: toPositiveInt(baseOptions.maxDepth, DEFAULT_MAX_DEPTH, '--max-depth'),
    maxDocs: toPositiveInt(baseOptions.maxDocs, DEFAULT_MAX_DOCS, '--max-docs'),
    pageSize: toIntegerInRange(baseOptions.pageSize, DEFAULT_PAGE_SIZE, 1, 500, '--page-size'),
  }
}
