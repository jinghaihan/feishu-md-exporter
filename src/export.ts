import type {
  DiscoverResult,
  DocumentItem,
  DocumentTreeNode,
  ExportMarkdownOptions,
  ExportMarkdownResult,
  ExportProgressEvent,
} from './types'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { FeishuClient } from './client'
import { discoverResultSchema } from './schema'
import {
  hasMarkdownBodyContent,
  jsonParse,
  mapWikiObjectKind,
  renderDocxMarkdown,
  sanitizePathSegment,
} from './utils'

export async function exportMarkdown(options: ExportMarkdownOptions): Promise<ExportMarkdownResult> {
  const manifest = await loadDiscoverResult(options.manifestPath)
  const documentsById = new Map(manifest.documents.map(item => [item.id, item]))
  const plan = buildExportPlan(manifest, documentsById)
  const client = new FeishuClient(options.appId, options.appSecret, options.pageSize, options.debug)

  const markdownCache = new Map<string, string>()
  const warnings: string[] = []
  let written = 0
  let skipped = 0
  let sequence = 0

  for (const entry of plan) {
    sequence += 1

    emitProgress(options, warnings, {
      status: 'processing',
      sequence,
      id: entry.item.id,
      message: `Exporting ${entry.item.id}`,
      written,
      skipped,
    })

    try {
      const targetPath = `${join(options.outputDirPath, ...entry.pathSegments)}.md`
      const sourceToken = await resolveDocxSourceToken(client, entry.item)
      if (!sourceToken) {
        skipped += 1
        const message = `Skip ${entry.item.id}: no docx source`
        warnings.push(message)
        emitProgress(options, warnings, {
          status: 'skip',
          sequence,
          id: entry.item.id,
          message,
          written,
          skipped,
        })
        continue
      }

      const cacheKey = `docx:${sourceToken}`
      let markdown = markdownCache.get(cacheKey)
      if (!markdown) {
        markdown = await fetchDocxMarkdown(client, sourceToken, entry.item.title)
        markdownCache.set(cacheKey, markdown)
      }

      if (!hasMarkdownBodyContent(markdown)) {
        await removeFileIfExists(targetPath)
        skipped += 1
        const message = `Skip ${entry.item.id}: markdown has no body content`
        warnings.push(message)
        emitProgress(options, warnings, {
          status: 'skip',
          sequence,
          id: entry.item.id,
          message,
          targetPath,
          written,
          skipped,
        })
        continue
      }

      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath, markdown, 'utf-8')

      written += 1
      emitProgress(options, warnings, {
        status: 'success',
        sequence,
        id: entry.item.id,
        message: `Exported ${entry.item.id}`,
        targetPath,
        written,
        skipped,
      })
    }
    catch (error) {
      skipped += 1
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Failed to export ${entry.item.id}: ${message}`)
      emitProgress(options, warnings, {
        status: 'error',
        sequence,
        id: entry.item.id,
        message: `Failed to export ${entry.item.id}: ${message}`,
        written,
        skipped,
      })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: options.manifestPath,
    outputDirPath: options.outputDirPath,
    total: plan.length,
    written,
    skipped,
    warnings,
  }
}

function emitProgress(
  options: ExportMarkdownOptions,
  warnings: string[],
  event: Omit<ExportProgressEvent, 'warnings'>,
) {
  options.onProgress?.({
    ...event,
    warnings: warnings.length,
  })
}

async function removeFileIfExists(path: string) {
  try {
    await unlink(path)
  }
  catch (error) {
    if (!isMissingFileError(error))
      throw error
  }
}

function isMissingFileError(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

async function loadDiscoverResult(manifestPath: string): Promise<DiscoverResult> {
  const content = await readFile(manifestPath, 'utf-8')
  const parsed = jsonParse<unknown>(content)
  if (!parsed)
    throw new Error(`Invalid JSON in manifest: ${manifestPath}`)

  const checked = discoverResultSchema.safeParse(parsed)
  if (!checked.success)
    throw new Error(`Invalid discover manifest shape: ${manifestPath}`)

  return checked.data as DiscoverResult
}

async function fetchDocxMarkdown(client: FeishuClient, documentToken: string, title: string | undefined) {
  const blocks = await client.getDocxBlocks(documentToken)
  let markdown = renderDocxMarkdown({
    title,
    blocks,
  })
  if (markdown.trim())
    return markdown

  const rawContent = await client.getDocxRawContent(documentToken)
  markdown = renderDocxMarkdown({
    title,
    blocks: [],
    rawContent,
  })
  return markdown
}

async function resolveDocxSourceToken(client: FeishuClient, item: DocumentItem): Promise<string | undefined> {
  if (item.kind === 'docx')
    return item.token

  if (item.kind !== 'wiki')
    return undefined

  const mappedKind = mapWikiObjectKind(item.objKind || '')
  if (mappedKind === 'docx' && item.objToken)
    return item.objToken

  const node = await client.getWikiNode(item.token)
  const resolvedKind = mapWikiObjectKind(node.objType || '')
  if (resolvedKind === 'docx' && node.objToken)
    return node.objToken

  return undefined
}

function buildExportPlan(manifest: DiscoverResult, documentsById: Map<string, DocumentItem>) {
  const roots = manifest.tree.length > 0 ? manifest.tree : buildFallbackTree(manifest.documents)
  const plans: {
    item: DocumentItem
    pathSegments: string[]
  }[] = []
  const pathCounters = new Map<string, number>()

  for (const root of roots)
    walkTree(root, undefined, [], new Set(), documentsById, pathCounters, plans)

  return plans
}

function buildFallbackTree(documents: DocumentItem[]): DocumentTreeNode[] {
  return documents.map(item => ({
    id: item.id,
    children: [],
  }))
}

function walkTree(
  node: DocumentTreeNode,
  parentItem: DocumentItem | undefined,
  parentSegments: string[],
  trail: Set<string>,
  documentsById: Map<string, DocumentItem>,
  pathCounters: Map<string, number>,
  plans: {
    item: DocumentItem
    pathSegments: string[]
  }[],
) {
  const item = documentsById.get(node.id)
  if (!item)
    return
  if (trail.has(node.id))
    return
  if (isWikiMappedDocxChild(item, parentItem))
    return

  const rawSegment = sanitizePathSegment(item.title, `${item.kind}-${item.token}`)
  const segment = createUniqueSegment(parentSegments, rawSegment, pathCounters)
  const pathSegments = [...parentSegments, segment]

  plans.push({
    item,
    pathSegments,
  })

  const nextTrail = new Set(trail)
  nextTrail.add(node.id)
  for (const child of node.children)
    walkTree(child, item, pathSegments, nextTrail, documentsById, pathCounters, plans)
}

function createUniqueSegment(parentSegments: string[], segment: string, pathCounters: Map<string, number>) {
  const parentKey = parentSegments.join('/')
  const baseKey = `${parentKey}::${segment}`
  const count = (pathCounters.get(baseKey) || 0) + 1
  pathCounters.set(baseKey, count)
  if (count === 1)
    return segment
  return `${segment}-${count}`
}

function isWikiMappedDocxChild(item: DocumentItem, parentItem: DocumentItem | undefined) {
  if (!parentItem)
    return false
  if (item.kind !== 'docx' || parentItem.kind !== 'wiki')
    return false

  const parentMappedKind = mapWikiObjectKind(parentItem.objKind || '')
  if (parentMappedKind !== 'docx')
    return false

  return !!(parentItem.objToken && parentItem.objToken === item.token)
}
