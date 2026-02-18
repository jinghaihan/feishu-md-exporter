import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exportMarkdown } from '../src/export'

const downloadDriveFileMock = vi.fn()
const getDocxBlocksMock = vi.fn()
const getDocxRawContentMock = vi.fn()
const getWikiNodeMock = vi.fn()

vi.mock('../src/client', () => {
  return {
    FeishuClient: class {
      downloadDriveFile = downloadDriveFileMock
      getDocxBlocks = getDocxBlocksMock
      getDocxRawContent = getDocxRawContentMock
      getWikiNode = getWikiNodeMock
    },
  }
})

describe('exportMarkdown file source', () => {
  beforeEach(() => {
    downloadDriveFileMock.mockReset()
    getDocxBlocksMock.mockReset()
    getDocxRawContentMock.mockReset()
    getWikiNodeMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports wiki node when objKind is file', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'feishu-export-file-'))
    const manifestPath = join(tempRoot, 'manifest.json')
    const outputDirPath = join(tempRoot, 'output')

    await writeFile(manifestPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      rootUrl: 'https://my.feishu.cn/wiki/root',
      total: 1,
      warnings: [],
      documents: [
        {
          id: 'wiki:root',
          kind: 'wiki',
          token: 'root',
          url: 'https://my.feishu.cn/wiki/root',
          depth: 0,
          title: 'Root File',
          objKind: 'file',
          objToken: 'file_token_001',
          parentIds: [],
        },
      ],
      relations: [],
      tree: [
        {
          id: 'wiki:root',
          children: [],
        },
      ],
    }), 'utf-8')

    downloadDriveFileMock.mockResolvedValue({
      content: '# Root File\n\ncontent body\n',
      contentType: 'text/markdown',
      contentDisposition: 'attachment; filename="Root File.md"',
    })

    const result = await exportMarkdown({
      appId: 'app',
      appSecret: 'secret',
      debug: false,
      pageSize: 200,
      manifestPath,
      outputDirPath,
    })

    expect(result.written).toBe(1)
    expect(result.skipped).toBe(0)
    expect(downloadDriveFileMock).toHaveBeenCalledWith('file_token_001')
    expect(getWikiNodeMock).not.toHaveBeenCalled()

    const output = await readFile(join(outputDirPath, 'Root File.md'), 'utf-8')
    expect(output).toContain('content body')
  })

  it('resolves file source from wiki node when manifest has no obj metadata', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'feishu-export-file-'))
    const manifestPath = join(tempRoot, 'manifest.json')
    const outputDirPath = join(tempRoot, 'output')

    await writeFile(manifestPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      rootUrl: 'https://my.feishu.cn/wiki/root',
      total: 1,
      warnings: [],
      documents: [
        {
          id: 'wiki:root',
          kind: 'wiki',
          token: 'root',
          url: 'https://my.feishu.cn/wiki/root',
          depth: 0,
          title: 'Node Fallback',
          parentIds: [],
        },
      ],
      relations: [],
      tree: [
        {
          id: 'wiki:root',
          children: [],
        },
      ],
    }), 'utf-8')

    getWikiNodeMock.mockResolvedValue({
      nodeToken: 'root',
      objType: 'file',
      objToken: 'file_token_002',
    })
    downloadDriveFileMock.mockResolvedValue({
      content: '# Node Fallback\n\nbody\n',
      contentType: 'text/plain; charset=utf-8',
      contentDisposition: '',
    })

    const result = await exportMarkdown({
      appId: 'app',
      appSecret: 'secret',
      debug: false,
      pageSize: 200,
      manifestPath,
      outputDirPath,
    })

    expect(result.written).toBe(1)
    expect(result.skipped).toBe(0)
    expect(getWikiNodeMock).toHaveBeenCalledWith('root')
    expect(downloadDriveFileMock).toHaveBeenCalledWith('file_token_002')
  })
})
