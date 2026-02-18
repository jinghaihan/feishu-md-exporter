import { describe, expect, it } from 'vitest'
import { hasMarkdownBodyContent, renderDocxMarkdown, sanitizePathSegment } from '../src/utils'

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
