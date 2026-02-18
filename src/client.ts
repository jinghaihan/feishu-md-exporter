import type { ZodType } from 'zod'
import type {
  DocumentBlocksPageData,
  DocumentDiscovery,
  DocumentMetaData,
  RawContentData,
  TenantAccessTokenCache,
  TenantAccessTokenData,
  WikiGetNodeData,
  WikiListNodesData,
  WikiNode,
  WikiNodeRaw,
} from './types'
import Bottleneck from 'bottleneck'
import { FetchError, ofetch } from 'ofetch'
import pRetry from 'p-retry'
import {
  API_RATE_LIMIT_BACKOFF_MAX_MS,
  API_RATE_LIMIT_BACKOFF_MIN_MS,
  API_RATE_LIMIT_MAX_CONCURRENT,
  API_RATE_LIMIT_MIN_TIME_MS,
  API_REQUEST_TIMEOUT_MS,
  API_RETRY_COUNT,
  API_RETRY_MAX_TIMEOUT_MS,
  API_RETRY_MIN_TIMEOUT_MS,
  DOCX_PAGE_SIZE_MAX,
  FEISHU_API_BASE,
  WIKI_PAGE_SIZE_MAX,
} from './constants'
import {
  documentBlocksPageDataSchema,
  documentMetaDataSchema,
  feishuEnvelopeSchema,
  rawContentDataSchema,
  tenantAccessTokenDataSchema,
  wikiGetNodeDataSchema,
  wikiListNodesDataSchema,
} from './schema'
import {
  buildWikiGetNodeCandidates,
  extractFeishuLinks,
  formatFetchErrorDetail,
  getFeishuErrorCode,
  isRateLimitErrorCode,
  unwrapFeishuData,
} from './utils'

export class FeishuClient {
  private tokenCache?: TenantAccessTokenCache
  private requestSequence = 0
  private readonly limiter = new Bottleneck({
    maxConcurrent: API_RATE_LIMIT_MAX_CONCURRENT,
    minTime: API_RATE_LIMIT_MIN_TIME_MS,
  })

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly pageSize: number,
    private readonly debug = false,
  ) {}

  async discoverFromDocx(documentToken: string): Promise<DocumentDiscovery> {
    const [title, links] = await Promise.all([
      this.getDocumentTitle(documentToken),
      this.collectDocumentLinks(documentToken),
    ])

    return {
      title,
      links,
    }
  }

  async getDocxBlocks(documentToken: string): Promise<unknown[]> {
    const blocks: unknown[] = []
    let pageToken: string | undefined

    for (;;) {
      const query = new URLSearchParams({ page_size: String(Math.min(this.pageSize, DOCX_PAGE_SIZE_MAX)) })
      if (pageToken)
        query.set('page_token', pageToken)

      const response = await this.request<DocumentBlocksPageData>(
        `/docx/v1/documents/${documentToken}/blocks?${query.toString()}`,
        documentBlocksPageDataSchema,
      )
      const items = response.items || response.blocks || []
      blocks.push(...items)

      if (!response.has_more)
        break

      pageToken = response.page_token
      if (!pageToken)
        break
    }

    return blocks
  }

  async getDocxRawContent(documentToken: string): Promise<string | undefined> {
    const response = await this.request<RawContentData>(
      `/docx/v1/documents/${documentToken}/raw_content`,
      rawContentDataSchema,
    )
    return response.content
  }

  async getWikiNode(nodeToken: string): Promise<WikiNode> {
    const candidates = buildWikiGetNodeCandidates(nodeToken)

    const errors: string[] = []
    for (const path of candidates) {
      try {
        this.debugLog(`wiki.get_node candidate => ${path}`)
        const response = await this.request<WikiGetNodeData>(path, wikiGetNodeDataSchema)
        const rawNode = response.node || response as unknown as WikiNodeRaw
        const normalized = this.normalizeWikiNode(rawNode)
        if (normalized) {
          this.debugLog(`wiki.get_node success => ${path}`)
          return normalized
        }

        errors.push(`${path}: empty node`)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${path}: ${message}`)
        const shouldContinue = this.shouldTryNextWikiGetNodeCandidate(message)
        this.debugLog(`wiki.get_node failed => ${path}, continue=${shouldContinue}, reason=${message}`)
        if (!shouldContinue)
          break
      }
    }

    throw new Error(`Failed to resolve wiki node token "${nodeToken}": ${errors.join(' | ')}`)
  }

  async listWikiChildNodes(spaceId: string, parentNodeToken: string): Promise<WikiNode[]> {
    const nodes: WikiNode[] = []
    let pageToken: string | undefined

    for (;;) {
      const query = new URLSearchParams({
        page_size: String(Math.min(this.pageSize, WIKI_PAGE_SIZE_MAX)),
        parent_node_token: parentNodeToken,
      })
      if (pageToken)
        query.set('page_token', pageToken)

      const response = await this.request<WikiListNodesData>(
        `/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes?${query.toString()}`,
        wikiListNodesDataSchema,
      )
      const rawItems = response.items || response.nodes || []
      for (const rawNode of rawItems) {
        const normalized = this.normalizeWikiNode(rawNode)
        if (normalized)
          nodes.push(normalized)
      }

      if (!response.has_more)
        break

      pageToken = response.page_token
      if (!pageToken)
        break
    }

    return nodes
  }

  private async getDocumentTitle(documentToken: string) {
    try {
      const response = await this.request<DocumentMetaData>(
        `/docx/v1/documents/${documentToken}`,
        documentMetaDataSchema,
      )
      return response.document?.title || response.title
    }
    catch {
      return undefined
    }
  }

  private async collectDocumentLinks(documentToken: string) {
    const links = new Set<string>()
    let pageToken: string | undefined
    let shouldFallbackToRawContent = false

    for (;;) {
      const query = new URLSearchParams({ page_size: String(Math.min(this.pageSize, DOCX_PAGE_SIZE_MAX)) })
      if (pageToken)
        query.set('page_token', pageToken)

      try {
        const response = await this.request<DocumentBlocksPageData>(
          `/docx/v1/documents/${documentToken}/blocks?${query.toString()}`,
          documentBlocksPageDataSchema,
        )
        const items = response.items || response.blocks || []
        for (const link of extractFeishuLinks(items))
          links.add(link)

        if (!response.has_more)
          break

        pageToken = response.page_token
        if (!pageToken)
          break
      }
      catch {
        shouldFallbackToRawContent = true
        break
      }
    }

    if (shouldFallbackToRawContent || links.size === 0) {
      try {
        const response = await this.request<RawContentData>(
          `/docx/v1/documents/${documentToken}/raw_content`,
          rawContentDataSchema,
        )
        for (const link of extractFeishuLinks(response.content))
          links.add(link)
      }
      catch {
        // ignore fallback errors
      }
    }

    return Array.from(links)
  }

  private normalizeWikiNode(node?: WikiNodeRaw): WikiNode | null {
    if (!node?.node_token)
      return null

    return {
      nodeToken: node.node_token,
      parentNodeToken: node.parent_node_token,
      spaceId: node.space_id,
      title: node.title,
      objType: node.obj_type,
      objToken: node.obj_token,
      hasChild: node.has_child,
    }
  }

  private shouldTryNextWikiGetNodeCandidate(message: string) {
    const normalized = message.toLowerCase()
    return normalized.includes('field validation failed')
  }

  private async request<T>(path: string, schema: ZodType<T>, init: RequestInit = {}, withAuth = true): Promise<T> {
    const requestId = ++this.requestSequence
    this.debugLog(`req#${requestId} queued path=${path} method=${init.method || 'GET'} withAuth=${withAuth}`)

    return this.limiter.schedule(() => this.requestWithRetry(requestId, path, schema, init, withAuth))
  }

  private async requestWithoutLimiter<T>(path: string, schema: ZodType<T>, init: RequestInit = {}, withAuth = true): Promise<T> {
    const requestId = ++this.requestSequence
    this.debugLog(`req#${requestId} queued-unlimited path=${path} method=${init.method || 'GET'} withAuth=${withAuth}`)
    return this.requestWithRetry(requestId, path, schema, init, withAuth)
  }

  private async requestWithRetry<T>(requestId: number, path: string, schema: ZodType<T>, init: RequestInit = {}, withAuth = true): Promise<T> {
    return pRetry(
      () => this.requestOnce(requestId, path, schema, init, withAuth),
      {
        retries: API_RETRY_COUNT,
        minTimeout: API_RETRY_MIN_TIMEOUT_MS,
        maxTimeout: API_RETRY_MAX_TIMEOUT_MS,
        randomize: true,
        shouldRetry: ({ error }) => this.shouldRetryRequest(error),
        onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
          const message = error instanceof Error ? error.message : String(error)
          this.debugLog(`req#${requestId} retry attempt=${attemptNumber} left=${retriesLeft} reason=${message}`)
        },
      },
    )
  }

  private shouldRetryRequest(error: Error) {
    return error instanceof FeishuRequestError && error.retriable
  }

  private async requestOnce<T>(requestId: number, path: string, schema: ZodType<T>, init: RequestInit = {}, withAuth = true): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json; charset=utf-8')
    const startedAt = Date.now()

    this.debugLog(`req#${requestId} start path=${path}`)

    if (withAuth) {
      const token = await this.getTenantAccessToken()
      headers.set('Authorization', `Bearer ${token}`)
    }

    try {
      const payload = await ofetch<unknown>(
        `${FEISHU_API_BASE}${path}`,
        {
          method: init.method,
          body: init.body,
          headers: Object.fromEntries(headers.entries()),
          timeout: API_REQUEST_TIMEOUT_MS,
        },
      )

      const parsedEnvelope = feishuEnvelopeSchema.safeParse(payload)
      if (!parsedEnvelope.success)
        throw new FeishuRequestError(`Feishu response validation failed (${path})`, false)

      if (parsedEnvelope.data.code !== 0) {
        const retriable = isRateLimitErrorCode(parsedEnvelope.data.code)
        if (retriable)
          await this.waitForRateLimitBackoff(requestId, path, String(parsedEnvelope.data.code))
        throw new FeishuRequestError(
          `Feishu API error (${path}): ${parsedEnvelope.data.code} ${parsedEnvelope.data.msg}`,
          retriable,
        )
      }

      const unwrappedData = unwrapFeishuData(parsedEnvelope.data)
      const parsedData = schema.safeParse(unwrappedData)
      if (!parsedData.success)
        throw new FeishuRequestError(`Feishu data validation failed (${path})`, false)

      this.debugLog(`req#${requestId} success path=${path} elapsed=${Date.now() - startedAt}ms`)
      return parsedData.data
    }
    catch (error) {
      if (error instanceof FetchError) {
        const status = error.response?.status || error.statusCode
        const statusText = error.response?.statusText || error.statusMessage || ''
        const errorCode = getFeishuErrorCode(error.data)
        const isRateLimited = isRateLimitErrorCode(errorCode) || status === 429
        const retriable = isRateLimited || (status !== undefined && status >= 500)
        const detail = formatFetchErrorDetail(error.data)
        if (isRateLimited)
          await this.waitForRateLimitBackoff(requestId, path, String(errorCode || status || '429'))
        this.debugLog(`req#${requestId} fetch-error path=${path} status=${status || 'unknown'} retriable=${retriable} elapsed=${Date.now() - startedAt}ms detail=${detail || 'none'}`)
        throw new FeishuRequestError(
          `Feishu request failed (${path}): ${status || 'unknown'} ${statusText}${detail ? ` - ${detail}` : ''}`,
          retriable,
        )
      }

      this.debugLog(`req#${requestId} error path=${path} elapsed=${Date.now() - startedAt}ms reason=${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  private async getTenantAccessToken() {
    const now = Date.now()
    if (this.tokenCache && now < this.tokenCache.expiredAt) {
      this.debugLog('auth cache hit')
      return this.tokenCache.token
    }

    this.debugLog('auth cache miss, requesting tenant_access_token')

    const response = await this.requestWithoutLimiter<TenantAccessTokenData>(
      '/auth/v3/tenant_access_token/internal',
      tenantAccessTokenDataSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
      },
      false,
    )

    this.tokenCache = {
      token: response.tenant_access_token,
      expiredAt: now + Math.max(60, response.expire - 120) * 1000,
    }

    this.debugLog(`auth token refreshed, ttl=${Math.max(60, response.expire - 120)}s`)
    return response.tenant_access_token
  }

  private async waitForRateLimitBackoff(requestId: number, path: string, reason: string) {
    const backoffMs = randomInRange(API_RATE_LIMIT_BACKOFF_MIN_MS, API_RATE_LIMIT_BACKOFF_MAX_MS)
    this.debugLog(`req#${requestId} rate-limit backoff path=${path} reason=${reason} sleep=${backoffMs}ms`)
    await sleep(backoffMs)
  }

  private debugLog(message: string) {
    if (!this.debug)
      return

    const now = new Date().toISOString()
    console.error(`[client][${now}] ${message}`)
  }
}

class FeishuRequestError extends Error {
  constructor(
    message: string,
    public readonly retriable: boolean,
  ) {
    super(message)
    this.name = 'FeishuRequestError'
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomInRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
