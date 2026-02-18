export interface CommandOptions {
  cwd?: string
  url?: string
  appId?: string
  appSecret?: string
  debug?: boolean | string
  skipDiscover?: boolean | string
  output?: string
  manifest?: string
  maxDepth?: number | string
  maxDocs?: number | string
  pageSize?: number | string
}

export interface ResolvedOptions extends Omit<Required<CommandOptions>, 'debug' | 'skipDiscover' | 'maxDepth' | 'maxDocs' | 'pageSize'> {
  debug: boolean
  skipDiscover: boolean
  outputDirPath: string
  manifestPath: string
  maxDepth: number
  maxDocs: number
  pageSize: number
}

export type FeishuResourceKind = 'docx' | 'wiki' | 'sheet' | 'base' | 'slides' | 'unknown'

export interface FeishuResource {
  kind: FeishuResourceKind
  token: string
  url: string
}

export interface FeishuApiEnvelope<T> {
  code: number
  msg: string
  data?: T
  error?: unknown
  [key: string]: unknown
}

export interface TenantAccessTokenData {
  tenant_access_token: string
  expire: number
}

export interface DocumentMetaData {
  document?: {
    title?: string
  }
  title?: string
}

export interface DocumentBlocksPageData {
  items?: unknown[]
  blocks?: unknown[]
  has_more?: boolean
  page_token?: string
}

export interface RawContentData {
  content?: string
}

export interface DriveFileDownload {
  content: string
  contentType?: string
  contentDisposition?: string
}

export interface WikiNodeRaw {
  node_token?: string
  parent_node_token?: string
  space_id?: string
  title?: string
  obj_type?: string
  obj_token?: string
  has_child?: boolean
}

export interface WikiGetNodeData {
  node?: WikiNodeRaw
}

export interface WikiListNodesData {
  items?: WikiNodeRaw[]
  nodes?: WikiNodeRaw[]
  has_more?: boolean
  page_token?: string
}

export interface WikiNode {
  nodeToken: string
  parentNodeToken?: string
  spaceId?: string
  title?: string
  objType?: string
  objToken?: string
  hasChild?: boolean
}

export interface TenantAccessTokenCache {
  token: string
  expiredAt: number
}

export interface DocumentDiscovery {
  title?: string
  links: string[]
}

export interface DiscoverOptions {
  url: string
  appId: string
  appSecret: string
  debug: boolean
  maxDepth: number
  maxDocs: number
  pageSize: number
  onProgress?: (event: DiscoverProgressEvent) => void
}

export interface ExportMarkdownOptions {
  appId: string
  appSecret: string
  debug: boolean
  pageSize: number
  manifestPath: string
  outputDirPath: string
  onProgress?: (event: ExportProgressEvent) => void
}

export interface DocumentItem {
  id: string
  kind: FeishuResourceKind
  token: string
  url: string
  depth: number
  title?: string
  objKind?: string
  objToken?: string
  parentId?: string
  parentIds: string[]
}

export interface DocumentRelation {
  parentId: string
  childId: string
}

export interface DocumentTreeNode {
  id: string
  children: DocumentTreeNode[]
}

export interface DiscoverResult {
  generatedAt: string
  rootUrl: string
  total: number
  warnings: string[]
  documents: DocumentItem[]
  relations: DocumentRelation[]
  tree: DocumentTreeNode[]
}

export interface ExportMarkdownResult {
  generatedAt: string
  sourceManifestPath: string
  outputDirPath: string
  total: number
  written: number
  skipped: number
  warnings: string[]
}

export interface QueueItem {
  url: string
  depth: number
  parentId?: string
  titleHint?: string
}

export type DiscoverProgressStatus = 'processing' | 'success' | 'skip' | 'warning' | 'error'
export type ExportProgressStatus = 'processing' | 'success' | 'skip' | 'error'

export interface DiscoverProgressEvent {
  status: DiscoverProgressStatus
  sequence: number
  url: string
  depth: number
  kind?: FeishuResourceKind
  id?: string
  title?: string
  message: string
  discovered: number
  warnings: number
}

export interface ExportProgressEvent {
  status: ExportProgressStatus
  sequence: number
  id: string
  message: string
  targetPath?: string
  written: number
  skipped: number
  warnings: number
}
