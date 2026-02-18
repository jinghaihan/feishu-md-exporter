import { z } from 'zod'

export const feishuEnvelopeSchema = z.object({
  code: z.number(),
  msg: z.string(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
}).catchall(z.unknown())

export const tenantAccessTokenDataSchema = z.object({
  tenant_access_token: z.string(),
  expire: z.number(),
}).catchall(z.unknown())

export const documentMetaDataSchema = z.object({
  document: z.object({
    title: z.string().optional(),
  }).optional(),
  title: z.string().optional(),
}).catchall(z.unknown())

export const documentBlocksPageDataSchema = z.object({
  items: z.array(z.unknown()).optional(),
  blocks: z.array(z.unknown()).optional(),
  has_more: z.boolean().optional(),
  page_token: z.string().optional(),
}).catchall(z.unknown())

export const rawContentDataSchema = z.object({
  content: z.string().optional(),
}).catchall(z.unknown())

export const wikiNodeRawSchema = z.object({
  node_token: z.string().optional(),
  parent_node_token: z.string().optional(),
  space_id: z.string().optional(),
  title: z.string().optional(),
  obj_type: z.string().optional(),
  obj_token: z.string().optional(),
  has_child: z.boolean().optional(),
}).catchall(z.unknown())

export const wikiGetNodeDataSchema = z.object({
  node: wikiNodeRawSchema.optional(),
}).catchall(z.unknown())

export const wikiListNodesDataSchema = z.object({
  items: z.array(wikiNodeRawSchema).optional(),
  nodes: z.array(wikiNodeRawSchema).optional(),
  has_more: z.boolean().optional(),
  page_token: z.string().optional(),
}).catchall(z.unknown())

export const documentItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['docx', 'wiki', 'sheet', 'base', 'slides', 'unknown']),
  token: z.string(),
  url: z.string(),
  depth: z.number(),
  title: z.string().optional(),
  objKind: z.string().optional(),
  objToken: z.string().optional(),
  parentId: z.string().optional(),
  parentIds: z.array(z.string()),
}).catchall(z.unknown())

export const documentRelationSchema = z.object({
  parentId: z.string(),
  childId: z.string(),
}).catchall(z.unknown())

export const documentTreeNodeSchema: z.ZodType<{
  id: string
  children: {
    id: string
    children: unknown[]
  }[]
}> = z.lazy(() => z.object({
  id: z.string(),
  children: z.array(documentTreeNodeSchema),
}).catchall(z.unknown()))

export const discoverResultSchema = z.object({
  generatedAt: z.string(),
  rootUrl: z.string(),
  total: z.number(),
  warnings: z.array(z.string()),
  documents: z.array(documentItemSchema),
  relations: z.array(documentRelationSchema),
  tree: z.array(documentTreeNodeSchema),
}).catchall(z.unknown())
