import type { CommandOptions } from './types'
import pkg from '../package.json'

export const NAME = pkg.name

export const VERSION = pkg.version

export const DEFAULT_OUTPUT_FILE = 'feishu-documents.json'
export const DEFAULT_MAX_DEPTH = 10
export const DEFAULT_MAX_DOCS = 1000
export const DEFAULT_PAGE_SIZE = 200
export const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'
export const DOCX_PAGE_SIZE_MAX = 500
export const WIKI_PAGE_SIZE_MAX = 50
export const API_RETRY_COUNT = 4
export const API_RETRY_MIN_TIMEOUT_MS = 300
export const API_RETRY_MAX_TIMEOUT_MS = 4000
export const API_REQUEST_TIMEOUT_MS = 12000
export const API_RATE_LIMIT_MIN_TIME_MS = 300
export const API_RATE_LIMIT_MAX_CONCURRENT = 1
export const API_RATE_LIMIT_BACKOFF_MIN_MS = 1500
export const API_RATE_LIMIT_BACKOFF_MAX_MS = 5000
export const FEISHU_RATE_LIMIT_CODES = [99991400]
export const WIKI_GET_NODE_QUERY_TEMPLATES = [
  'token={token}',
  'obj_type=wiki&token={token}',
  'obj_token={token}',
] as const

export const DEFAULT_OPTIONS: Partial<CommandOptions> = {
  debug: false,
  output: DEFAULT_OUTPUT_FILE,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxDocs: DEFAULT_MAX_DOCS,
  pageSize: DEFAULT_PAGE_SIZE,
}
