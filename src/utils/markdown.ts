import { FEISHU_CODE_LANGUAGE_ID_TO_MARKDOWN } from '../constants'

export interface RenderDocxMarkdownOptions {
  title?: string
  blocks: unknown[]
  rawContent?: string
}

const ORDERED_LIST_NUMBER_KEYS = [
  'order',
  'number',
  'sequence',
  'seq',
  'serial',
  'index',
  'start',
  'start_number',
  'startNumber',
] as const

interface BlockMeta {
  id?: string
  parentId?: string
  blockType: string
  block: unknown
}

interface BlockRenderContext {
  blockMetaByIdentity: WeakMap<object, BlockMeta>
  blockMetaById: Map<string, BlockMeta>
}

interface OrderedMarkerState {
  counters: Map<string, number>
}

export function renderDocxMarkdown(options: RenderDocxMarkdownOptions) {
  const lines: string[] = []
  const blockContext = createBlockRenderContext(options.blocks)
  const orderedMarkerState: OrderedMarkerState = {
    counters: new Map(),
  }
  const title = normalizeLine(options.title)
  if (title) {
    lines.push(`# ${title}`)
    lines.push('')
  }

  for (const block of options.blocks) {
    const blockType = getBlockType(block)
    if (hasAncestorBlockType(block, blockContext, 'table'))
      continue

    if (blockType !== 'ordered')
      orderedMarkerState.counters.clear()

    const blockLines = renderBlock(block, blockType, blockContext, orderedMarkerState)
    if (blockLines.length === 0)
      continue

    lines.push(...blockLines)
    lines.push('')
  }

  if (lines.length === 0) {
    const raw = normalizeRawContent(options.rawContent)
    if (raw)
      return normalizeMarkdownOutput(`${raw}\n`)
    return ''
  }

  if (!hasMarkdownBody(lines)) {
    const raw = normalizeRawContent(options.rawContent)
    if (raw) {
      lines.push(raw)
      lines.push('')
    }
  }

  const compacted = compactBlankLines(lines)
  const body = compacted.join('\n').trim()
  return body ? normalizeMarkdownOutput(`${body}\n`) : ''
}

export function hasMarkdownBodyContent(markdown: string) {
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
  let headingCount = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed)
      continue
    if (isMarkdownHeadingLine(trimmed)) {
      headingCount += 1
      continue
    }
    return true
  }

  return headingCount > 1
}

export function sanitizePathSegment(input: string | undefined, fallback = 'untitled') {
  const normalized = (input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')

  if (normalized)
    return normalized
  return fallback
}

export function normalizeMarkdownOutput(markdown: string) {
  if (!markdown)
    return ''

  const normalizedInput = markdown.replace(/\r\n/g, '\n')
  const hasTrailingNewline = normalizedInput.endsWith('\n')
  const lines = normalizedInput.split('\n')

  const normalizedLines: string[] = []
  let insideFencedCodeBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (isCodeFenceLine(trimmed)) {
      insideFencedCodeBlock = !insideFencedCodeBlock
      normalizedLines.push(line)
      continue
    }

    if (insideFencedCodeBlock) {
      normalizedLines.push(line)
      continue
    }

    let nextLine = normalizeBrokenMarkdownMarkers(line)
    nextLine = normalizeHeadingText(nextLine)

    normalizedLines.push(nextLine)
  }

  let normalized = normalizedLines.join('\n')
  if (hasTrailingNewline && !normalized.endsWith('\n'))
    normalized += '\n'

  return normalized
}

function createBlockRenderContext(blocks: unknown[]): BlockRenderContext {
  const blockMetaByIdentity = new WeakMap<object, BlockMeta>()
  const blockMetaById = new Map<string, BlockMeta>()
  const childLinks: Array<{ parentId: string, childId: string }> = []

  for (const block of blocks) {
    const record = toRecord(block)
    if (!record)
      continue

    const blockType = getBlockType(block)
    const id = readBlockIdentifier(record)
    const parentId = readParentIdentifier(record)
    const meta: BlockMeta = {
      id,
      parentId,
      blockType,
      block,
    }

    blockMetaByIdentity.set(record, meta)
    if (id && !blockMetaById.has(id))
      blockMetaById.set(id, meta)

    if (!id)
      continue

    for (const childId of readChildIdentifiers(record))
      childLinks.push({ parentId: id, childId })
  }

  for (const link of childLinks) {
    const childMeta = blockMetaById.get(link.childId)
    if (!childMeta || childMeta.parentId)
      continue
    childMeta.parentId = link.parentId
  }

  return {
    blockMetaByIdentity,
    blockMetaById,
  }
}

function getListDepth(block: unknown, blockType: string, context: BlockRenderContext) {
  if (!isListBlockType(blockType))
    return 0

  const meta = getBlockMeta(block, context)
  if (!meta?.parentId)
    return 0

  let depth = 0
  let cursor = meta.parentId
  const seen = new Set<string>()

  while (cursor) {
    if (seen.has(cursor))
      break
    seen.add(cursor)

    const parentMeta = context.blockMetaById.get(cursor)
    if (!parentMeta)
      break

    if (isListBlockType(parentMeta.blockType))
      depth += 1

    cursor = parentMeta.parentId || ''
  }

  return depth
}

function getBlockMeta(block: unknown, context: BlockRenderContext) {
  const record = toRecord(block)
  if (!record)
    return undefined
  return context.blockMetaByIdentity.get(record)
}

function hasAncestorBlockType(block: unknown, context: BlockRenderContext, blockType: string) {
  const meta = getBlockMeta(block, context)
  let cursor = meta?.parentId
  const seen = new Set<string>()

  while (cursor) {
    if (seen.has(cursor))
      break
    seen.add(cursor)

    const parent = context.blockMetaById.get(cursor)
    if (!parent)
      break
    if (parent.blockType === blockType)
      return true

    cursor = parent.parentId
  }

  return false
}

function isListBlockType(blockType: string) {
  return blockType === 'bullet' || blockType === 'ordered' || blockType === 'todo'
}

function renderTableBlock(block: unknown, context: BlockRenderContext): string[] {
  const matrix = readTableMatrix(block, context)
  if (matrix.length === 0)
    return []

  const width = Math.max(...matrix.map(row => row.length))
  if (width <= 0)
    return []

  const normalizedMatrix = matrix.map((row) => {
    const next = [...row]
    while (next.length < width)
      next.push('')
    return next
  })

  const header = normalizedMatrix[0]
  const body = normalizedMatrix.slice(1)
  const tableLines = [
    renderMarkdownTableRow(header),
    renderMarkdownTableRow(Array.from({ length: width }, () => '---')),
    ...body.map(renderMarkdownTableRow),
  ]

  return tableLines
}

function readTableMatrix(block: unknown, context: BlockRenderContext): string[][] {
  const record = toRecord(block)
  if (!record)
    return []

  const tablePayload = toRecord(record.table) || record
  const rows = readTableRowsFromValue(tablePayload.rows, context)
  if (rows.length > 0)
    return rows

  const cells = readTableRowsFromValue(tablePayload.cells, context)
  if (cells.length > 0)
    return cells

  const cellIds = readTableRowsFromValue(tablePayload.cell_ids, context)
  if (cellIds.length > 0)
    return cellIds

  const property = toRecord(tablePayload.property)
  const rowSize = toPositiveInteger(tablePayload.row_size) || toPositiveInteger(property?.row_size)
  const columnSize = toPositiveInteger(tablePayload.column_size) || toPositiveInteger(property?.column_size)
  if (rowSize && columnSize) {
    const flatChildren = readChildIdentifiers(record)
    if (flatChildren.length >= rowSize * columnSize) {
      const rowsFromChildren: string[][] = []
      for (let row = 0; row < rowSize; row += 1) {
        const rowValues: string[] = []
        for (let column = 0; column < columnSize; column += 1) {
          const index = row * columnSize + column
          const childId = flatChildren[index]
          rowValues.push(resolveTableCell(childId, context))
        }
        rowsFromChildren.push(rowValues)
      }
      return rowsFromChildren
    }
  }

  return []
}

function readTableRowsFromValue(value: unknown, context: BlockRenderContext): string[][] {
  if (!Array.isArray(value))
    return []

  const rows: string[][] = []
  for (const row of value) {
    const parsed = readTableRow(row, context)
    if (parsed.length > 0)
      rows.push(parsed)
  }

  return rows
}

function readTableRow(value: unknown, context: BlockRenderContext): string[] {
  if (Array.isArray(value))
    return value.map(cell => resolveTableCell(cell, context))

  const record = toRecord(value)
  if (!record)
    return []

  const fromCells = readTableRowsFromValue(record.cells, context)
  if (fromCells.length > 0)
    return fromCells[0]

  const fromValues = readTableRowsFromValue(record.values, context)
  if (fromValues.length > 0)
    return fromValues[0]

  return [resolveTableCell(value, context)]
}

function resolveTableCell(value: unknown, context: BlockRenderContext) {
  if (typeof value === 'string') {
    const meta = context.blockMetaById.get(value)
    if (meta)
      return normalizeTableCellText(extractBlockText(meta.block, true))
    return normalizeTableCellText(value)
  }

  const record = toRecord(value)
  if (!record)
    return normalizeTableCellText('')

  const blockId = readBlockIdentifier(record)
  if (blockId) {
    const meta = context.blockMetaById.get(blockId)
    if (meta)
      return normalizeTableCellText(extractBlockText(meta.block, true))
  }

  return normalizeTableCellText(extractText(value, true))
}

function normalizeTableCellText(value: string) {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim()
  return normalized
}

function renderMarkdownTableRow(cells: string[]) {
  return `| ${cells.join(' | ')} |`
}

function renderBlock(
  block: unknown,
  blockType: string,
  context: BlockRenderContext,
  orderedMarkerState: OrderedMarkerState,
): string[] {
  if (blockType === 'table')
    return renderTableBlock(block, context)

  const text = blockType === 'code'
    ? normalizeCodeBlockContent(extractBlockText(block))
    : normalizeLine(extractBlockText(block, true))
  if (!text)
    return []

  if (blockType === 'heading1')
    return [`# ${text}`]
  if (blockType === 'heading2')
    return [`## ${text}`]
  if (blockType === 'heading3')
    return [`### ${text}`]
  if (blockType === 'heading4')
    return [`#### ${text}`]
  if (blockType === 'heading5')
    return [`##### ${text}`]
  if (blockType === 'heading6')
    return [`###### ${text}`]
  const listDepth = getListDepth(block, blockType, context)
  const indent = listDepth > 0 ? '  '.repeat(listDepth) : ''
  if (blockType === 'bullet')
    return [`${indent}- ${text}`]
  if (blockType === 'ordered') {
    const marker = resolveOrderedListMarker(block, listDepth, context, orderedMarkerState)
    return [`${indent}${marker}. ${text}`]
  }
  if (blockType === 'todo')
    return [`${indent}- [ ] ${text}`]
  if (blockType === 'quote')
    return [`> ${text}`]
  if (blockType === 'code') {
    const language = getCodeLanguage(block, text)
    return [`\`\`\`${language}`, text, '```']
  }

  return [text]
}

function getBlockType(block: unknown) {
  const payloadType = getPayloadBlockType(block)
  if (payloadType)
    return payloadType

  const normalized = getNormalizedBlockType(block)
  if (normalized)
    return normalized

  const numeric = getNumericBlockType(block)
  if (numeric === 3)
    return 'heading1'
  if (numeric === 4)
    return 'heading2'
  if (numeric === 5)
    return 'heading3'
  if (numeric === 6)
    return 'heading4'
  if (numeric === 7)
    return 'heading5'
  if (numeric === 8)
    return 'heading6'
  if (numeric === 9)
    return 'bullet'
  if (numeric === 10)
    return 'ordered'
  if (numeric === 13)
    return 'ordered'
  if (numeric === 11)
    return 'code'
  if (numeric === 12)
    return 'quote'
  if (numeric === 31)
    return 'table'
  if (numeric === 14)
    return 'todo'
  return 'paragraph'
}

function getPayloadBlockType(block: unknown) {
  if (!block || typeof block !== 'object')
    return undefined

  const record = block as Record<string, unknown>
  if ('heading1' in record)
    return 'heading1'
  if ('heading2' in record)
    return 'heading2'
  if ('heading3' in record)
    return 'heading3'
  if ('heading4' in record)
    return 'heading4'
  if ('heading5' in record)
    return 'heading5'
  if ('heading6' in record)
    return 'heading6'
  if ('bullet' in record)
    return 'bullet'
  if ('ordered' in record)
    return 'ordered'
  if ('code' in record)
    return 'code'
  if ('quote' in record)
    return 'quote'
  if ('table' in record)
    return 'table'
  if ('todo' in record)
    return 'todo'
  if ('callout' in record)
    return 'callout'
  return undefined
}

function getNumericBlockType(block: unknown) {
  if (!block || typeof block !== 'object')
    return undefined

  const value = (block as Record<string, unknown>).block_type
  if (typeof value === 'number')
    return value
  return undefined
}

function getNormalizedBlockType(block: unknown) {
  if (!block || typeof block !== 'object')
    return undefined

  const record = block as Record<string, unknown>
  const fromType = record.block_type
  if (typeof fromType === 'string')
    return fromType.toLowerCase()
  if (typeof record.type === 'string')
    return record.type.toLowerCase()
  return undefined
}

function getCodeLanguage(block: unknown, content: string) {
  if (!block || typeof block !== 'object')
    return ''

  const code = (block as Record<string, unknown>).code
  if (!code || typeof code !== 'object')
    return ''

  let resolved = ''
  const style = (code as Record<string, unknown>).style
  if (style && typeof style === 'object') {
    const languageFromStyle = (style as Record<string, unknown>).language
    if (typeof languageFromStyle === 'number')
      resolved = FEISHU_CODE_LANGUAGE_ID_TO_MARKDOWN[languageFromStyle] || ''
    if (typeof languageFromStyle === 'string')
      resolved = normalizeCodeFenceLanguage(languageFromStyle)
  }

  if (!resolved) {
    const languageFromCode = (code as Record<string, unknown>).language
    if (typeof languageFromCode === 'string')
      resolved = normalizeCodeFenceLanguage(languageFromCode)
    if (typeof languageFromCode === 'number')
      resolved = FEISHU_CODE_LANGUAGE_ID_TO_MARKDOWN[languageFromCode] || ''
  }

  return inferCodeFenceLanguage(resolved, content)
}

function extractBlockText(block: unknown, richText = false) {
  if (!block || typeof block !== 'object')
    return ''

  const record = block as Record<string, unknown>
  const payloadKeys = [
    'heading1',
    'heading2',
    'heading3',
    'heading4',
    'heading5',
    'heading6',
    'text',
    'bullet',
    'ordered',
    'code',
    'quote',
    'todo',
    'callout',
  ]

  for (const key of payloadKeys) {
    if (!(key in record))
      continue
    const value = extractText(record[key], richText)
    if (value)
      return value
  }

  return extractText(block, richText)
}

function extractText(value: unknown, richText = false): string {
  if (typeof value === 'string')
    return value

  if (!value || typeof value !== 'object')
    return ''

  if (Array.isArray(value)) {
    const combined = value.map(item => extractText(item, richText)).filter(Boolean).join('')
    return combined
  }

  const record = value as Record<string, unknown>
  if (Array.isArray(record.elements))
    return record.elements.map(item => extractText(item, richText)).filter(Boolean).join('')

  if (record.text_run && typeof record.text_run === 'object') {
    return extractTextRun(record.text_run as Record<string, unknown>, richText)
  }

  const contentKeys = ['content', 'text', 'title', 'name']
  for (const key of contentKeys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim())
      return candidate
  }

  return ''
}

function extractTextRun(textRun: Record<string, unknown>, richText: boolean) {
  const content = textRun.content
  if (typeof content !== 'string')
    return ''

  if (!richText)
    return content

  const style = textRun.text_element_style
  if (!style || typeof style !== 'object')
    return content

  return applyTextElementStyle(content, style as Record<string, unknown>)
}

function applyTextElementStyle(content: string, style: Record<string, unknown>) {
  let formatted = content

  if (style.inline_code === true)
    formatted = wrapInlineCode(formatted)
  if (style.bold === true)
    formatted = wrapMarkdownStyle(formatted, '**')
  if (style.italic === true)
    formatted = wrapMarkdownStyle(formatted, '*')
  if (style.strikethrough === true)
    formatted = wrapMarkdownStyle(formatted, '~~')
  if (style.underline === true)
    formatted = `<u>${formatted}</u>`

  return formatted
}

function wrapMarkdownStyle(content: string, marker: string) {
  if (!content)
    return content
  return `${marker}${content}${marker}`
}

function wrapInlineCode(content: string) {
  if (!content)
    return content

  const matches = content.match(/`+/g) || []
  const longest = matches.length ? Math.max(...matches.map(match => match.length)) : 0
  const fence = '`'.repeat(longest + 1)
  const needsPadding = content.startsWith('`') || content.endsWith('`')
  const normalized = needsPadding ? ` ${content} ` : content
  return `${fence}${normalized}${fence}`
}

function normalizeLine(input: string | undefined) {
  if (!input)
    return ''
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCodeBlockContent(input: string | undefined) {
  if (!input)
    return ''
  return input
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizeRawContent(input: string | undefined) {
  if (!input)
    return ''
  return input.trim()
}

function normalizeCodeFenceLanguage(input: string) {
  const normalized = input.trim().toLowerCase()
  if (!normalized)
    return ''
  if (normalized === 'js')
    return 'javascript'
  if (normalized === 'jsx')
    return 'jsx'
  if (normalized === 'ts')
    return 'typescript'
  if (normalized === 'tsx')
    return 'tsx'
  if (normalized === 'javascriptreact')
    return 'jsx'
  if (normalized === 'typescriptreact')
    return 'tsx'
  if (normalized === 'yml')
    return 'yaml'
  if (normalized === 'plaintext' || normalized === 'plain text')
    return 'text'
  return normalized
}

function inferCodeFenceLanguage(language: string, content: string) {
  if (!content.trim())
    return language

  if (language === 'javascript' && looksLikeJsx(content))
    return 'jsx'
  if (language === 'typescript' && looksLikeJsx(content))
    return 'tsx'
  if ((language === 'html' || language === 'text') && looksLikeVueSfc(content))
    return 'vue'

  return language
}

function looksLikeJsx(content: string) {
  return /<[A-Z][A-Za-z0-9]*(?:\s|>)/.test(content)
    || /return\s*\(\s*</.test(content)
    || /<>\s*/.test(content)
}

function looksLikeVueSfc(content: string) {
  return /<template(?:\s|>)/.test(content)
    && /<script(?:\s|>)/.test(content)
}

function hasMarkdownBody(lines: string[]) {
  return lines.some(line => !!line.trim() && !line.trimStart().startsWith('#'))
}

function isMarkdownHeadingLine(line: string) {
  return /^#{1,6}\s+/.test(line)
}

function compactBlankLines(lines: string[]) {
  const compacted: string[] = []
  let previousBlank = false

  for (const line of lines) {
    const blank = line.trim() === ''
    if (blank && previousBlank)
      continue

    compacted.push(line)
    previousBlank = blank
  }

  return compacted
}

function normalizeBrokenMarkdownMarkers(line: string) {
  return line
    .replace(/\*{4}(`[^`\n]+`)\*{4}/g, '$1')
    .replace(/\*{4}(`[^`\n]+`)\*{2}/g, '**$1**')
    .replace(/\*{2}(`[^`\n]+`)\*{4}/g, '**$1**')
    .replace(/\*\*([^*\n`]*?\S)\s+\*\*/g, '**$1**')
}

function normalizeHeadingText(line: string) {
  const markerLength = readHeadingMarkerLength(line)
  if (markerLength === 0)
    return line

  const headingText = line
    .slice(markerLength + 1)
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return `${line.slice(0, markerLength)} ${headingText}`
}

function isCodeFenceLine(trimmedLine: string) {
  return trimmedLine.startsWith('```')
}

function readHeadingMarkerLength(line: string) {
  let markerLength = 0
  while (markerLength < line.length && markerLength < 6 && line[markerLength] === '#')
    markerLength += 1

  if (markerLength === 0)
    return 0
  if (line[markerLength] !== ' ')
    return 0

  return markerLength
}

function getOrderedMarkerGroupKey(block: unknown, listDepth: number, context: BlockRenderContext) {
  const meta = getBlockMeta(block, context)
  if (meta?.parentId)
    return `parent:${meta.parentId}:depth:${listDepth}`
  return `root:depth:${listDepth}`
}

function readBlockIdentifier(record: Record<string, unknown>) {
  const directKeys = ['block_id', 'blockId', 'id']
  for (const key of directKeys) {
    const value = toStringId(record[key])
    if (value)
      return value
  }
  return undefined
}

function readParentIdentifier(record: Record<string, unknown>) {
  const directKeys = ['parent_id', 'parentId']
  for (const key of directKeys) {
    const value = toStringId(record[key])
    if (value)
      return value
  }

  const parent = toRecord(record.parent)
  if (parent)
    return readBlockIdentifier(parent)

  return undefined
}

function readChildIdentifiers(record: Record<string, unknown>) {
  const ids = new Set<string>()
  const directKeys = ['children_ids', 'child_ids', 'childrenIds', 'childIds']
  for (const key of directKeys)
    collectIdentifierList(record[key], ids)

  const children = record.children
  collectIdentifierList(children, ids)

  const childrenRecord = toRecord(children)
  if (childrenRecord) {
    collectIdentifierList(childrenRecord.block_ids, ids)
    collectIdentifierList(childrenRecord.child_ids, ids)
    collectIdentifierList(childrenRecord.children, ids)
    collectIdentifierList(childrenRecord.items, ids)
  }

  return Array.from(ids)
}

function collectIdentifierList(value: unknown, ids: Set<string>) {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized)
      ids.add(normalized)
    return
  }

  if (!value)
    return

  if (Array.isArray(value)) {
    for (const item of value)
      collectIdentifierList(item, ids)
    return
  }

  const record = toRecord(value)
  if (!record)
    return

  const id = readBlockIdentifier(record)
  if (id)
    ids.add(id)
}

function resolveOrderedListMarker(
  block: unknown,
  listDepth: number,
  context: BlockRenderContext,
  state: OrderedMarkerState,
) {
  const record = toRecord(block)
  const groupKey = getOrderedMarkerGroupKey(block, listDepth, context)
  const fromOrderedPayload = readOrderedNumber(record?.ordered)
  if (fromOrderedPayload) {
    state.counters.set(groupKey, fromOrderedPayload)
    return fromOrderedPayload
  }

  const fromBlock = readOrderedNumber(block)
  if (fromBlock) {
    state.counters.set(groupKey, fromBlock)
    return fromBlock
  }

  const previous = state.counters.get(groupKey) || 0
  const next = previous + 1
  state.counters.set(groupKey, next)
  return next
}

function readOrderedNumber(value: unknown): number | undefined {
  const record = toRecord(value)
  if (!record)
    return undefined

  for (const key of ORDERED_LIST_NUMBER_KEYS) {
    const direct = toPositiveInteger(record[key])
    if (direct)
      return direct
  }

  const nestedKeys = ['style', 'list_style', 'listStyle']
  for (const nestedKey of nestedKeys) {
    const nested = toRecord(record[nestedKey])
    if (!nested)
      continue

    for (const key of ORDERED_LIST_NUMBER_KEYS) {
      const nestedValue = toPositiveInteger(nested[key])
      if (nestedValue)
        return nestedValue
    }
  }

  return undefined
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object')
    return undefined
  return value as Record<string, unknown>
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0)
    return value

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0)
      return parsed
  }

  return undefined
}

function toStringId(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined

  const normalized = value.trim()
  if (!normalized)
    return undefined

  return normalized
}
