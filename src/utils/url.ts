import type { FeishuResource, FeishuResourceKind } from '../types'

const FEISHU_HOST_PATTERN = /(?:feishu\.cn|larksuite\.com|larkoffice\.com)$/i
const FEISHU_PATH_KINDS = new Set(['docx', 'wiki', 'sheets', 'sheet', 'base', 'bitable', 'slides'])
const FEISHU_URL_REGEX = /https?:\/\/[^\s"'`<>)\]]+/g

export function parseFeishuResource(input: string): FeishuResource | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  }
  catch {
    return null
  }

  if (!isFeishuHost(parsed.hostname))
    return null

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2)
    return null

  const rawKind = segments[0]?.toLowerCase()
  const token = segments[1]
  if (!rawKind || !token)
    return null

  if (!FEISHU_PATH_KINDS.has(rawKind))
    return null

  return {
    kind: normalizeKind(rawKind),
    token,
    url: `${parsed.origin}/${rawKind}/${token}`,
  }
}

export function extractFeishuLinks(input: unknown): string[] {
  const strings: string[] = []
  iterateObjectStrings(input, strings)

  const links = new Set<string>()
  for (const segment of strings) {
    const matches = segment.match(FEISHU_URL_REGEX)
    if (!matches)
      continue

    for (const match of matches) {
      const parsed = parseFeishuResource(match)
      if (parsed)
        links.add(parsed.url)
    }
  }

  return Array.from(links)
}

function normalizeKind(kind: string): FeishuResourceKind {
  if (kind === 'docx')
    return 'docx'
  if (kind === 'wiki')
    return 'wiki'
  if (kind === 'sheet' || kind === 'sheets')
    return 'sheet'
  if (kind === 'base' || kind === 'bitable')
    return 'base'
  if (kind === 'slides')
    return 'slides'
  return 'unknown'
}

function isFeishuHost(hostname: string) {
  return FEISHU_HOST_PATTERN.test(hostname)
}

function iterateObjectStrings(input: unknown, output: string[]) {
  if (typeof input === 'string') {
    output.push(input)
    return
  }

  if (!input || typeof input !== 'object')
    return

  if (Array.isArray(input)) {
    for (const item of input)
      iterateObjectStrings(item, output)
    return
  }

  for (const value of Object.values(input))
    iterateObjectStrings(value, output)
}
