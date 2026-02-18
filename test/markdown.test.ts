import { describe, expect, it } from 'vitest'
import { hasMarkdownBodyContent, normalizeMarkdownOutput, renderDocxMarkdown, sanitizePathSegment } from '../src/utils'

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

  it('renders ordered blocks as sequential markdown list numbers', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'First' } }],
          },
        },
        {
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'Second' } }],
          },
        },
        {
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'Third' } }],
          },
        },
      ],
    })

    expect(markdown).toContain('1. First')
    expect(markdown).toContain('2. Second')
    expect(markdown).toContain('3. Third')
  })

  it('prefers ordered marker from block payload when present', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          block_type: 10,
          ordered: {
            order: 5,
            elements: [{ text_run: { content: 'Fifth' } }],
          },
        },
        {
          block_type: 10,
          ordered: {
            order: 6,
            elements: [{ text_run: { content: 'Sixth' } }],
          },
        },
      ],
    })

    expect(markdown).toContain('5. Fifth')
    expect(markdown).toContain('6. Sixth')
  })

  it('renders nested bullet list using block parent relationship', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          block_id: 'b1',
          block_type: 9,
          bullet: {
            elements: [{ text_run: { content: 'Parent item' } }],
          },
        },
        {
          block_id: 'b2',
          parent_id: 'b1',
          block_type: 9,
          bullet: {
            elements: [{ text_run: { content: 'Child item' } }],
          },
        },
      ],
    })

    expect(markdown).toContain('- Parent item')
    expect(markdown).toContain('  - Child item')
  })

  it('renders nested ordered list with depth-aware fallback numbering', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          block_id: 'o1',
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'Top 1' } }],
          },
        },
        {
          block_id: 'o2',
          parent_id: 'o1',
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'Sub 1' } }],
          },
        },
        {
          block_id: 'o3',
          parent_id: 'o1',
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'Sub 2' } }],
          },
        },
        {
          block_id: 'o4',
          block_type: 10,
          ordered: {
            elements: [{ text_run: { content: 'Top 2' } }],
          },
        },
      ],
    })

    expect(markdown).toContain('1. Top 1')
    expect(markdown).toContain('  1. Sub 1')
    expect(markdown).toContain('  2. Sub 2')
    expect(markdown).toContain('2. Top 2')
  })

  it('renders table block to markdown table and suppresses table child blocks', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          block_id: 't1',
          block_type: 31,
          table: {
            cells: [
              ['c11', 'c12'],
              ['c21', 'c22'],
            ],
          },
        },
        {
          block_id: 'c11',
          parent_id: 't1',
          text: {
            elements: [{ text_run: { content: 'Name' } }],
          },
        },
        {
          block_id: 'c12',
          parent_id: 't1',
          text: {
            elements: [{ text_run: { content: 'Score' } }],
          },
        },
        {
          block_id: 'c21',
          parent_id: 't1',
          text: {
            elements: [{ text_run: { content: 'Alice' } }],
          },
        },
        {
          block_id: 'c22',
          parent_id: 't1',
          text: {
            elements: [{ text_run: { content: '95' } }],
          },
        },
      ],
    })

    expect(markdown).toContain('| Name | Score |')
    expect(markdown).toContain('| --- | --- |')
    expect(markdown).toContain('| Alice | 95 |')
  })

  it('falls back to raw content when blocks are empty', () => {
    const markdown = renderDocxMarkdown({
      blocks: [],
      rawContent: 'raw body',
    })

    expect(markdown).toBe('raw body\n')
  })

  it('renders code payload as fenced code when block type is 14', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          block_type: 14,
          code: {
            elements: [
              {
                text_run: {
                  content: 'const a = 1;\nconst b = 2;',
                },
              },
            ],
            style: {
              language: 30,
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```javascript')
    expect(markdown).toContain('const a = 1;\nconst b = 2;')
    expect(markdown).not.toContain('- [ ] const a = 1;')
  })

  it('maps numeric code language from style to markdown language', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          code: {
            elements: [
              {
                text_run: {
                  content: '<div>Hello</div>',
                },
              },
            ],
            style: {
              language: 24,
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```html')
  })

  it('maps numeric typescript language from style to markdown language', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          code: {
            elements: [
              {
                text_run: {
                  content: 'const x: number = 1',
                },
              },
            ],
            style: {
              language: 63,
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```typescript')
  })

  it('normalizes string language aliases for code fences', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          code: {
            elements: [
              {
                text_run: {
                  content: 'console.log(1)',
                },
              },
            ],
            style: {
              language: 'js',
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```javascript')
  })

  it('infers jsx fence from javascript with JSX syntax', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          code: {
            elements: [
              {
                text_run: {
                  content: 'export const App = () => {\n  return (<Button />)\n}',
                },
              },
            ],
            style: {
              language: 30,
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```jsx')
  })

  it('infers tsx fence from typescript with JSX syntax', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          code: {
            elements: [
              {
                text_run: {
                  content: 'const App: React.FC = () => {\n  return (<div />)\n}',
                },
              },
            ],
            style: {
              language: 63,
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```tsx')
  })

  it('infers vue fence from html language with SFC structure', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          code: {
            elements: [
              {
                text_run: {
                  content: '<template><div /></template>\n<script setup lang=\"ts\"></script>',
                },
              },
            ],
            style: {
              language: 24,
            },
          },
        },
      ],
    })

    expect(markdown).toContain('```vue')
  })

  it('renders inline rich text styles for non-code blocks', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          text: {
            elements: [
              { text_run: { content: 'Read ' } },
              { text_run: { content: 'bold', text_element_style: { bold: true } } },
              { text_run: { content: ' and ' } },
              { text_run: { content: 'italic', text_element_style: { italic: true } } },
              { text_run: { content: ' and ' } },
              { text_run: { content: 'code', text_element_style: { inline_code: true } } },
              { text_run: { content: ' and ' } },
              { text_run: { content: 'strike', text_element_style: { strikethrough: true } } },
              { text_run: { content: ' and ' } },
              { text_run: { content: 'under', text_element_style: { underline: true } } },
            ],
          },
        },
      ],
    })

    expect(markdown).toContain('Read **bold** and *italic* and `code` and ~~strike~~ and <u>under</u>')
  })

  it('renders inline code with embedded backticks safely', () => {
    const markdown = renderDocxMarkdown({
      blocks: [
        {
          text: {
            elements: [
              { text_run: { content: 'value: ' } },
              { text_run: { content: 'a`b', text_element_style: { inline_code: true } } },
            ],
          },
        },
      ],
    })

    expect(markdown).toContain('value: ``a`b``')
  })
})

describe('sanitizePathSegment', () => {
  it('normalizes unsupported filename characters', () => {
    expect(sanitizePathSegment('a/b:c*?', 'fallback')).toBe('a-b-c')
  })
})

describe('hasMarkdownBodyContent', () => {
  it('returns false for heading-only markdown', () => {
    expect(hasMarkdownBodyContent('# Title\n')).toBe(false)
  })

  it('returns true for multi-heading markdown', () => {
    expect(hasMarkdownBodyContent('# Title\n\n## Section\n')).toBe(true)
  })

  it('returns true when markdown has non-heading body', () => {
    expect(hasMarkdownBodyContent('# Title\n\nBody text\n')).toBe(true)
  })
})

describe('normalizeMarkdownOutput', () => {
  it('removes broken bold markers in headings', () => {
    const markdown = '### **21. 解释 TypeScript 中的**`this`** 和**`=>`** (箭头函数)。**\n'
    expect(normalizeMarkdownOutput(markdown)).toBe('### 21. 解释 TypeScript 中的`this` 和`=>` (箭头函数)。\n')
  })

  it('does not renumber list markers in post-processing', () => {
    const markdown = [
      '```md',
      '1. keep',
      '1. keep',
      '```',
      '',
      '1. out',
      '1. out',
      '',
    ].join('\n')

    expect(normalizeMarkdownOutput(markdown)).toBe([
      '```md',
      '1. keep',
      '1. keep',
      '```',
      '',
      '1. out',
      '1. out',
      '',
    ].join('\n'))
  })
})
