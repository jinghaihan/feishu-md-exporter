import { describe, expect, it } from 'vitest'
import { renderDocxMarkdown, sanitizePathSegment } from '../src/utils'

describe('renderDocxMarkdown', () => {
  it('renders heading and list blocks', () => {
    const markdown = renderDocxMarkdown({
      title: 'Sample',
      blocks: [
        {
          block_type: 3,
          heading1: {
            elements: [{ text_run: { content: 'Heading One' } }],
          },
        },
        {
          block_type: 9,
          bullet: {
            elements: [{ text_run: { content: 'List Item' } }],
          },
        },
      ],
    })

    expect(markdown).toContain('# Sample')
    expect(markdown).toContain('# Heading One')
    expect(markdown).toContain('- List Item')
  })

  it('falls back to raw content when blocks are empty', () => {
    const markdown = renderDocxMarkdown({
      blocks: [],
      rawContent: 'raw body',
    })

    expect(markdown).toBe('raw body\n')
  })
})

describe('sanitizePathSegment', () => {
  it('normalizes unsupported filename characters', () => {
    expect(sanitizePathSegment('a/b:c*?', 'fallback')).toBe('a-b-c')
  })
})
