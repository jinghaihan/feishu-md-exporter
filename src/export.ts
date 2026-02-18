import type {
  DiscoverResult,
  DocumentItem,
  DocumentTreeNode,
  ExportMarkdownOptions,
  ExportMarkdownResult,
  ExportProgressEvent,
} from './types'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { dirname, join } from 'pathe'
import { FeishuClient } from './client'
import { EXPORTABLE_TEXT_FILE_EXTENSIONS, WIKI_OBJECT_KIND_FILE } from './constants'
import { discoverResultSchema } from './schema'
import {
  hasMarkdownBodyContent,
  jsonParse,
  mapWikiObjectKind,
  normalizeMarkdownOutput,
  parseContentDispositionFilename,
  renderDocxMarkdown,
  sanitizePathSegment,
} from './utils'

interface ExportSource {
  kind: 'docx' | 'file'
  token: string
}

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
      const source = await resolveExportSource(client, entry.item)
      if (!source) {
        skipped += 1
        const message = `Skip ${entry.item.id}: no supported export source`
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

      const cacheKey = `${source.kind}:${source.token}`
      let markdown = markdownCache.get(cacheKey)
      if (!markdown) {
        markdown = source.kind === 'docx'
          ? await fetchDocxMarkdown(client, source.token, entry.item.title)
          : await fetchDriveFileMarkdown(client, source.token, entry.item.title)
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

async function fetchDriveFileMarkdown(client: FeishuClient, fileToken: string, title: string | undefined) {
  const downloaded = await client.downloadDriveFile(fileToken)
  const filename = parseContentDispositionFilename(downloaded.contentDisposition) || title || ''
  if (!isTextFile(filename, downloaded.contentType))
    throw new Error(`Unsupported file type for markdown export (${fileToken})`)

  const markdown = normalizeMarkdownOutput(stripUtf8Bom(downloaded.content || ''))
  return markdown
}

async function resolveExportSource(client: FeishuClient, item: DocumentItem): Promise<ExportSource | undefined> {
  if (item.kind === 'docx')
    return { kind: 'docx', token: item.token }

  if (item.kind !== 'wiki')
    return undefined

  const directResolved = resolveWikiObjectSource(item.objKind, item.objToken)
  if (directResolved)
    return directResolved

  const node = await client.getWikiNode(item.token)
  const nodeResolved = resolveWikiObjectSource(node.objType, node.objToken)
  if (nodeResolved)
    return nodeResolved

  return undefined
}

function resolveWikiObjectSource(objKind: string | undefined, objToken: string | undefined): ExportSource | undefined {
  if (!objToken)
    return undefined

  const mappedKind = mapWikiObjectKind(objKind || '')
  if (mappedKind === 'docx')
    return { kind: 'docx', token: objToken }

  if ((objKind || '').toLowerCase() === WIKI_OBJECT_KIND_FILE)
    return { kind: 'file', token: objToken }

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

function isTextFile(filename: string | undefined, contentType: string | undefined) {
  const normalizedContentType = (contentType || '').toLowerCase()
  if (normalizedContentType.startsWith('text/'))
    return true
  if (normalizedContentType.includes('markdown'))
    return true

  const normalizedExt = extname(filename || '').toLowerCase()
  if (!normalizedExt)
    return false

  return EXPORTABLE_TEXT_FILE_EXTENSIONS.includes(normalizedExt as (typeof EXPORTABLE_TEXT_FILE_EXTENSIONS)[number])
}

function stripUtf8Bom(value: string) {
  if (value.startsWith('\uFEFF'))
    return value.slice(1)
  return value
}
