export interface CommandOptions {
  cwd?: string
  url?: string
  appId?: string
  appSecret?: string
  debug?: boolean | string
  output?: string
  maxDepth?: number | string
  maxDocs?: number | string
  pageSize?: number | string
}

export interface ResolvedOptions extends Omit<Required<CommandOptions>, 'debug' | 'maxDepth' | 'maxDocs' | 'pageSize'> {
  debug: boolean
  outputPath: string
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

export interface QueueItem {
  url: string
  depth: number
  parentId?: string
  titleHint?: string
}

export type DiscoverProgressStatus = 'processing' | 'success' | 'skip' | 'warning' | 'error'

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
