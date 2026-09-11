import { describe, expect, it } from 'vitest'
import { isSuccessResultCode, ResultEnum } from './enum'

describe('isSuccessResultCode', () => {
  it('accepts 0 as success (legacy convention)', () => {
    expect(isSuccessResultCode(ResultEnum.Success0)).toBe(true)
  })

  it('accepts 200 as success', () => {
    expect(isSuccessResultCode(200)).toBe(true)
  })

  it('accepts other 2xx business codes (201/203 etc.)', () => {
    // 后端创建类接口返回 201/203，旧实现会误判为失败
    expect(isSuccessResultCode(201)).toBe(true)
    expect(isSuccessResultCode(203)).toBe(true)
    expect(isSuccessResultCode(299)).toBe(true)
  })

  it('rejects non-2xx codes', () => {
    expect(isSuccessResultCode(400)).toBe(false)
    expect(isSuccessResultCode(401)).toBe(false)
    expect(isSuccessResultCode(500)).toBe(false)
    expect(isSuccessResultCode(100)).toBe(false)
    expect(isSuccessResultCode(300)).toBe(false)
  })
})
