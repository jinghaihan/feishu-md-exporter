import { describe, expect, it } from 'vitest'
import { unwrapFeishuData } from '../src/utils/feishu'

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
