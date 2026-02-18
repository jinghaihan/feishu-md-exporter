import { describe, expect, it } from 'vitest'
import { parseContentDispositionFilename, unwrapFeishuData } from '../src/utils/feishu'

describe('unwrapFeishuData', () => {
  it('returns payload.data when present', () => {
    const data = unwrapFeishuData({
      code: 0,
      msg: 'ok',
      data: { value: 'x' },
    })

    expect(data).toEqual({ value: 'x' })
  })

  it('supports flat auth response payload', () => {
    const data = unwrapFeishuData({
      code: 0,
      msg: 'ok',
      tenant_access_token: 'token',
      expire: 7200,
    })

    expect(data).toEqual({
      tenant_access_token: 'token',
      expire: 7200,
    })
  })
})

describe('parseContentDispositionFilename', () => {
  it('parses plain filename', () => {
    expect(parseContentDispositionFilename('attachment; filename="note.md"')).toBe('note.md')
  })

  it('parses RFC5987 encoded filename', () => {
    expect(parseContentDispositionFilename('attachment; filename*=UTF-8\'\'TypeScript%E6%A0%B8%E5%BF%83.md')).toBe('TypeScript核心.md')
  })
})
