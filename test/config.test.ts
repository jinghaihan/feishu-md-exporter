import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'

describe('resolveConfig', () => {
  it('requires url when skip-discover is disabled', async () => {
    await expect(resolveConfig({
      cwd: process.cwd(),
      appId: 'app',
      appSecret: 'secret',
      skipDiscover: false,
    })).rejects.toThrow('Missing required option: --url')
  })

  it('allows empty url when skip-discover is enabled', async () => {
    const resolved = await resolveConfig({
      cwd: process.cwd(),
      appId: 'app',
      appSecret: 'secret',
      skipDiscover: true,
      output: 'output',
      manifest: 'manifest.json',
    })

    expect(resolved.skipDiscover).toBe(true)
    expect(resolved.url).toBe('')
  })
})
