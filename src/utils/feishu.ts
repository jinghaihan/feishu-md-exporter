import type { FeishuApiEnvelope } from '../types'
import { FEISHU_RATE_LIMIT_CODES, WIKI_GET_NODE_QUERY_TEMPLATES } from '../constants'
import { jsonParse } from './json'

export function unwrapFeishuData<T>(payload: FeishuApiEnvelope<T> & Record<string, unknown>): T {
  if (payload.data !== undefined)
    return payload.data

  const flattenedPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !['code', 'msg', 'error', 'data'].includes(key)),
  )

  return flattenedPayload as T
}

export function buildWikiGetNodeCandidates(nodeToken: string) {
  const encodedToken = encodeURIComponent(nodeToken)
  return WIKI_GET_NODE_QUERY_TEMPLATES.map(
    template => `/wiki/v2/spaces/get_node?${template.replace('{token}', encodedToken)}`,
  )
}

export function formatFetchErrorDetail(data: unknown): string {
  if (!data)
    return ''

  if (typeof data === 'string') {
    const parsed = jsonParse<Record<string, unknown>>(data)
    if (parsed)
      return formatFetchErrorDetail(parsed)

    return data.slice(0, 300).trim()
  }

  if (typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.code === 'number' && typeof payload.msg === 'string')
      return `${payload.code} ${payload.msg}`

    return JSON.stringify(payload).slice(0, 300).trim()
  }

  return String(data).slice(0, 300).trim()
}

export function getFeishuErrorCode(data: unknown): number | undefined {
  if (!data)
    return undefined

  if (typeof data === 'object') {
    const payload = data as Record<string, unknown>
    if (typeof payload.code === 'number')
      return payload.code
    return undefined
  }

  if (typeof data === 'string') {
    const parsed = jsonParse<Record<string, unknown>>(data)
    if (parsed && typeof parsed.code === 'number')
      return parsed.code
  }

  return undefined
}

export function isRateLimitErrorCode(code: number | undefined) {
  return !!(code && FEISHU_RATE_LIMIT_CODES.includes(code))
}

export function parseContentDispositionFilename(contentDisposition: string | undefined) {
  if (!contentDisposition)
    return undefined

  const parameters = contentDisposition
    .split(';')
    .map(segment => segment.trim())
    .filter(Boolean)

  const extendedParameter = parameters.find(parameter => parameter.toLowerCase().startsWith('filename*='))
  if (extendedParameter) {
    const rawValue = extendedParameter.slice(extendedParameter.indexOf('=') + 1).trim()
    const encoded = rawValue.includes('\'\'')
      ? rawValue.slice(rawValue.indexOf('\'\'') + 2)
      : rawValue

    try {
      return decodeURIComponent(stripOptionalQuotes(encoded))
    }
    catch {
      // ignore decode errors and fallback to plain filename parsing
    }
  }

  const simpleParameter = parameters.find(parameter => parameter.toLowerCase().startsWith('filename='))
  if (!simpleParameter)
    return undefined

  const simpleValue = simpleParameter.slice(simpleParameter.indexOf('=') + 1).trim()
  return stripOptionalQuotes(simpleValue) || undefined
}

function stripOptionalQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"'))
    return value.slice(1, -1)

  return value
}
