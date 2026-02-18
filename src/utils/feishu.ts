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
