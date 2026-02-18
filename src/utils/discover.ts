import type {
  DocumentItem,
  DocumentRelation,
  DocumentTreeNode,
  FeishuResourceKind,
} from '../types'

export function resourceId(kind: FeishuResourceKind, token: string) {
  return `${kind}:${token}`
}

export function mapWikiObjectKind(kind: string): FeishuResourceKind {
  const normalized = kind.toLowerCase()

  if (normalized === 'docx' || normalized === 'doc')
    return 'docx'
  if (normalized === 'sheet' || normalized === 'sheets')
    return 'sheet'
  if (normalized === 'bitable' || normalized === 'base')
    return 'base'
  if (normalized === 'slides')
    return 'slides'
  if (normalized === 'wiki')
    return 'wiki'
  return 'unknown'
}

export function mergeParentRelation(item: DocumentItem, parentId: string | undefined, relations: Set<string>) {
  if (!parentId)
    return

  if (!item.parentIds.includes(parentId))
    item.parentIds.push(parentId)

  relations.add(`${parentId}=>${item.id}`)
}

export function serializeRelations(relations: Set<string>): DocumentRelation[] {
  return Array.from(relations).map((relation) => {
    const [parentId, childId] = relation.split('=>')
    return { parentId, childId }
  })
}

export function buildDocumentTree(documents: DocumentItem[], relations: DocumentRelation[]): DocumentTreeNode[] {
  const childrenByParent = new Map<string, string[]>()
  const childIds = new Set<string>()
  const documentIdSet = new Set(documents.map(item => item.id))

  for (const relation of relations) {
    if (!documentIdSet.has(relation.parentId) || !documentIdSet.has(relation.childId))
      continue

    childIds.add(relation.childId)
    const children = childrenByParent.get(relation.parentId) || []
    children.push(relation.childId)
    childrenByParent.set(relation.parentId, children)
  }

  const roots = documents
    .map(item => item.id)
    .filter(id => !childIds.has(id))

  return roots.map(rootId => toTreeNode(rootId, childrenByParent, new Set()))
}

function toTreeNode(id: string, childrenByParent: Map<string, string[]>, trail: Set<string>): DocumentTreeNode {
  if (trail.has(id))
    return { id, children: [] }

  const nextTrail = new Set(trail)
  nextTrail.add(id)
  const children = (childrenByParent.get(id) || []).map(childId => toTreeNode(childId, childrenByParent, nextTrail))
  return { id, children }
}
