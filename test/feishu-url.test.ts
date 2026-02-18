import { describe, expect, it } from 'vitest'
import { extractFeishuLinks, parseFeishuResource } from '../src/utils/url'

describe('parseFeishuResource', () => {
  it('parses docx url', () => {
    const resource = parseFeishuResource('https://my.feishu.cn/docx/TEST_DOCX_TOKEN_001')
    expect(resource).toEqual({
      kind: 'docx',
      token: 'TEST_DOCX_TOKEN_001',
      url: 'https://my.feishu.cn/docx/TEST_DOCX_TOKEN_001',
    })
  })

  it('normalizes sheets path', () => {
    const resource = parseFeishuResource('https://example.feishu.cn/sheets/abc123?sheet=xxx')
    expect(resource).toEqual({
      kind: 'sheet',
      token: 'abc123',
      url: 'https://example.feishu.cn/sheets/abc123',
    })
  })
})

describe('extractFeishuLinks', () => {
  it('extracts and deduplicates links from nested objects', () => {
    const links = extractFeishuLinks({
      text: 'see https://my.feishu.cn/docx/TEST_DOCX_TOKEN_001 for details',
      blocks: [
        {
          richText: 'child: https://my.feishu.cn/wiki/TEST_WIKI_TOKEN_001',
        },
        {
          richText: 'duplicate: https://my.feishu.cn/wiki/TEST_WIKI_TOKEN_001',
        },
      ],
    })

    expect(links).toEqual([
      'https://my.feishu.cn/docx/TEST_DOCX_TOKEN_001',
      'https://my.feishu.cn/wiki/TEST_WIKI_TOKEN_001',
    ])
  })
})
