import type { DocumentItem } from '../src/types'
import { describe, expect, it } from 'vitest'
import { buildDocumentTree, mergeParentRelation, serializeRelations } from '../src/utils'

describe('discover structure helpers', () => {
  it('tracks parent ids and relations', () => {
    const relations = new Set<string>()
    const item: DocumentItem = {
      id: 'docx:child',
      kind: 'docx',
      token: 'child',
      url: 'https://my.feishu.cn/docx/child',
      depth: 1,
      parentIds: [],
    }

    mergeParentRelation(item, 'wiki:parentA', relations)
    mergeParentRelation(item, 'wiki:parentA', relations)
    mergeParentRelation(item, 'wiki:parentB', relations)

    expect(item.parentIds).toEqual(['wiki:parentA', 'wiki:parentB'])
    expect(serializeRelations(relations)).toEqual([
      { parentId: 'wiki:parentA', childId: 'docx:child' },
      { parentId: 'wiki:parentB', childId: 'docx:child' },
    ])
  })

  it('builds tree from relations', () => {
    const documents: DocumentItem[] = [
      {
        id: 'wiki:root',
        kind: 'wiki',
        token: 'root',
        url: 'https://my.feishu.cn/wiki/root',
        depth: 0,
        parentIds: [],
      },
      {
        id: 'docx:child',
        kind: 'docx',
        token: 'child',
        url: 'https://my.feishu.cn/docx/child',
        depth: 1,
        parentIds: ['wiki:root'],
      },
    ]

    const tree = buildDocumentTree(documents, [
      { parentId: 'wiki:root', childId: 'docx:child' },
    ])

    expect(tree).toEqual([
      {
        id: 'wiki:root',
        children: [
          {
            id: 'docx:child',
            children: [],
          },
        ],
      },
    ])
  })
})
