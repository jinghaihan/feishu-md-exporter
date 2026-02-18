import type {
  DiscoverOptions,
  DiscoverProgressEvent,
  DiscoverResult,
  DocumentItem,
  FeishuResource,
  QueueItem,
} from './types'
import { FeishuClient } from './client'
import {
  buildDocumentTree,
  mapWikiObjectKind,
  mergeParentRelation,
  parseFeishuResource,
  resourceId,
  serializeRelations,
} from './utils'

export async function discoverDocuments(options: DiscoverOptions): Promise<DiscoverResult> {
  const root = parseFeishuResource(options.url)
  if (!root)
    throw new Error('Invalid Feishu document url. Example: https://my.feishu.cn/docx/<token>')

  const client = new FeishuClient(options.appId, options.appSecret, options.pageSize, options.debug)
  const queue: QueueItem[] = [{ url: root.url, depth: 0 }]
  const documents = new Map<string, DocumentItem>()
  const relations = new Set<string>()
  const warnings: string[] = []
  let sequence = 0

  while (queue.length > 0) {
    const next = queue.shift()
    if (!next)
      continue

    debugLog(options, `dequeue #${sequence + 1}: url=${next.url} depth=${next.depth} queue_remaining=${queue.length}`)
    sequence += 1
    emitProgress(options, documents, warnings, {
      status: 'processing',
      sequence,
      url: next.url,
      depth: next.depth,
      message: `Reading ${next.url}`,
    })

    const parsed = parseFeishuResource(next.url)
    if (!parsed) {
      const warning = `Skip invalid feishu url: ${next.url}`
      warnings.push(warning)
      emitProgress(options, documents, warnings, {
        status: 'warning',
        sequence,
        url: next.url,
        depth: next.depth,
        message: warning,
      })
      continue
    }

    const id = resourceId(parsed.kind, parsed.token)
    if (documents.has(id)) {
      const existing = documents.get(id)!
      mergeParentRelation(existing, next.parentId, relations)
      emitProgress(options, documents, warnings, {
        status: 'skip',
        sequence,
        url: parsed.url,
        depth: next.depth,
        kind: parsed.kind,
        id,
        title: existing.title,
        message: `Skip duplicated resource: ${id}`,
      })
      continue
    }

    if (documents.size >= options.maxDocs) {
      const warning = `Stop discovery: reached max docs limit ${options.maxDocs}`
      warnings.push(warning)
      emitProgress(options, documents, warnings, {
        status: 'warning',
        sequence,
        url: parsed.url,
        depth: next.depth,
        kind: parsed.kind,
        id,
        message: warning,
      })
      break
    }

    const item: DocumentItem = {
      id,
      kind: parsed.kind,
      token: parsed.token,
      url: parsed.url,
      depth: next.depth,
      title: next.titleHint,
      parentId: next.parentId,
      parentIds: next.parentId ? [next.parentId] : [],
    }
    mergeParentRelation(item, next.parentId, relations)
    documents.set(id, item)

    try {
      if (parsed.kind === 'docx') {
        const discovered = await client.discoverFromDocx(parsed.token)
        item.title = discovered.title
        let discoveredLinks = 0

        if (next.depth >= options.maxDepth) {
          debugLog(options, `max depth reached for ${id}, skip child expansion`)
          emitProgress(options, documents, warnings, {
            status: 'success',
            sequence,
            url: parsed.url,
            depth: next.depth,
            kind: parsed.kind,
            id,
            title: item.title,
            message: formatSuccessMessage(parsed, id, item.title, discoveredLinks),
          })
          continue
        }

        for (const link of discovered.links) {
          queue.push({
            url: link,
            depth: next.depth + 1,
            parentId: id,
          })
          discoveredLinks += 1
        }
        debugLog(options, `docx ${id} discovered ${discoveredLinks} links`)

        emitProgress(options, documents, warnings, {
          status: 'success',
          sequence,
          url: parsed.url,
          depth: next.depth,
          kind: parsed.kind,
          id,
          title: item.title,
          message: formatSuccessMessage(parsed, id, item.title, discoveredLinks),
        })
        continue
      }

      if (parsed.kind === 'wiki') {
        const wikiNode = await client.getWikiNode(parsed.token)
        item.title = wikiNode.title || item.title
        item.objKind = wikiNode.objType
        item.objToken = wikiNode.objToken
        let discoveredLinks = 0

        if (wikiNode.objType && wikiNode.objToken) {
          const mappedKind = mapWikiObjectKind(wikiNode.objType)
          if (mappedKind !== 'unknown') {
            const origin = new URL(parsed.url).origin
            queue.push({
              url: `${origin}/${mappedKind}/${wikiNode.objToken}`,
              depth: next.depth,
              parentId: id,
              titleHint: wikiNode.title,
            })
            discoveredLinks += 1
            debugLog(options, `wiki ${id} mapped to object ${mappedKind}:${wikiNode.objToken}`)
          }
        }

        if (next.depth >= options.maxDepth || !wikiNode.spaceId) {
          if (next.depth >= options.maxDepth)
            debugLog(options, `max depth reached for wiki ${id}, skip wiki child listing`)
          if (!wikiNode.spaceId)
            debugLog(options, `wiki ${id} has no space_id, skip wiki child listing`)
          emitProgress(options, documents, warnings, {
            status: 'success',
            sequence,
            url: parsed.url,
            depth: next.depth,
            kind: parsed.kind,
            id,
            title: item.title,
            message: formatSuccessMessage(parsed, id, item.title, discoveredLinks),
          })
          continue
        }

        const children = await client.listWikiChildNodes(wikiNode.spaceId, wikiNode.nodeToken)
        const origin = new URL(parsed.url).origin
        for (const child of children) {
          queue.push({
            url: `${origin}/wiki/${child.nodeToken}`,
            depth: next.depth + 1,
            parentId: id,
            titleHint: child.title,
          })
          discoveredLinks += 1
        }
        debugLog(options, `wiki ${id} discovered ${children.length} child nodes`)

        emitProgress(options, documents, warnings, {
          status: 'success',
          sequence,
          url: parsed.url,
          depth: next.depth,
          kind: parsed.kind,
          id,
          title: item.title,
          message: formatSuccessMessage(parsed, id, item.title, discoveredLinks),
        })
        continue
      }

      const warning = `Skip recursion for unsupported resource kind: ${parsed.kind} (${parsed.url})`
      warnings.push(warning)
      emitProgress(options, documents, warnings, {
        status: 'warning',
        sequence,
        url: parsed.url,
        depth: next.depth,
        kind: parsed.kind,
        id,
        title: item.title,
        message: warning,
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const warning = `Failed to read ${parsed.url}: ${message}`
      warnings.push(warning)
      debugLog(options, warning)
      emitProgress(options, documents, warnings, {
        status: 'error',
        sequence,
        url: parsed.url,
        depth: next.depth,
        kind: parsed.kind,
        id,
        title: item.title,
        message: warning,
      })
    }
  }

  const documentList = Array.from(documents.values())
  const relationList = serializeRelations(relations)

  return {
    generatedAt: new Date().toISOString(),
    rootUrl: root.url,
    total: documentList.length,
    warnings,
    documents: documentList,
    relations: relationList,
    tree: buildDocumentTree(documentList, relationList),
  }
}

function debugLog(options: DiscoverOptions, message: string) {
  if (!options.debug)
    return

  const now = new Date().toISOString()
  console.error(`[discover][${now}] ${message}`)
}

function emitProgress(
  options: DiscoverOptions,
  documents: Map<string, DocumentItem>,
  warnings: string[],
  event: Omit<DiscoverProgressEvent, 'discovered' | 'warnings'>,
) {
  options.onProgress?.({
    ...event,
    discovered: documents.size,
    warnings: warnings.length,
  })
}

function formatSuccessMessage(
  parsed: FeishuResource,
  id: string,
  title: string | undefined,
  discoveredLinks: number,
) {
  const label = title?.trim() || id
  return `Read ${parsed.kind}: ${label} (+${discoveredLinks} links)`
}
