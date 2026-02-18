export interface RenderDocxMarkdownOptions {
  title?: string
  blocks: unknown[]
  rawContent?: string
}

export function renderDocxMarkdown(options: RenderDocxMarkdownOptions) {
  const lines: string[] = []
  const title = normalizeLine(options.title)
  if (title) {
    lines.push(`# ${title}`)
    lines.push('')
  }

  for (const block of options.blocks) {
    const blockLines = renderBlock(block)
    if (blockLines.length === 0)
      continue

    lines.push(...blockLines)
    lines.push('')
  }

  if (lines.length === 0) {
    const raw = normalizeRawContent(options.rawContent)
    if (raw)
      return `${raw}\n`
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
  return body ? `${body}\n` : ''
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

function renderBlock(block: unknown): string[] {
  const blockType = getBlockType(block)
  const text = normalizeLine(extractBlockText(block))
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
  if (blockType === 'bullet')
    return [`- ${text}`]
  if (blockType === 'ordered')
    return [`1. ${text}`]
  if (blockType === 'todo')
    return [`- [ ] ${text}`]
  if (blockType === 'quote')
    return [`> ${text}`]
  if (blockType === 'code') {
    const language = getCodeLanguage(block)
    return [`\`\`\`${language}`, text, '```']
  }

  return [text]
}

function getBlockType(block: unknown) {
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
  if (numeric === 11)
    return 'code'
  if (numeric === 12)
    return 'quote'
  if (numeric === 14)
    return 'todo'
  return 'paragraph'
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

function getCodeLanguage(block: unknown) {
  if (!block || typeof block !== 'object')
    return ''

  const code = (block as Record<string, unknown>).code
  if (!code || typeof code !== 'object')
    return ''

  const language = (code as Record<string, unknown>).language
  if (typeof language !== 'string')
    return ''

  return language.trim()
}

function extractBlockText(block: unknown) {
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
    const value = extractText(record[key])
    if (value)
      return value
  }

  return extractText(block)
}

function extractText(value: unknown): string {
  if (typeof value === 'string')
    return value

  if (!value || typeof value !== 'object')
    return ''

  if (Array.isArray(value)) {
    const combined = value.map(item => extractText(item)).filter(Boolean).join('')
    return combined
  }

  const record = value as Record<string, unknown>
  if (Array.isArray(record.elements))
    return record.elements.map(item => extractText(item)).filter(Boolean).join('')

  if (record.text_run && typeof record.text_run === 'object') {
    const content = (record.text_run as Record<string, unknown>).content
    if (typeof content === 'string')
      return content
  }

  const contentKeys = ['content', 'text', 'title', 'name']
  for (const key of contentKeys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim())
      return candidate
  }

  return ''
}

function normalizeLine(input: string | undefined) {
  if (!input)
    return ''
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRawContent(input: string | undefined) {
  if (!input)
    return ''
  return input.trim()
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
