import { FEISHU_CODE_LANGUAGE_ID_TO_MARKDOWN } from '../constants'

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
  if (blockType === 'bullet')
    return [`- ${text}`]
  if (blockType === 'ordered')
    return [`1. ${text}`]
  if (blockType === 'todo')
    return [`- [ ] ${text}`]
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
