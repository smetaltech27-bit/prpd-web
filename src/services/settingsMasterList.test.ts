import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAllSettingsMasterItems } from './prpdRepository'

const mocks = vi.hoisted(() => ({ from: vi.fn(), adminFrom: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { from: mocks.from }, settingsSupabase: { from: mocks.adminFrom },
}))

const row = (id: string) => ({ id, name_part: 'PART', code_order_rm: `RM-${id}`, vendors: { name: 'VENDOR' }, is_active: true })

function page(data: ReturnType<typeof row>[], error: Error | null = null) {
  const result = {
    select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  }
  return result
}

describe('complete Settings master list', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads beyond 1000 rows in stable order and maps Code RM', async () => {
    const pages = [page(Array.from({ length: 500 }, (_, i) => row(String(i)))),
      page(Array.from({ length: 500 }, (_, i) => row(String(i + 500)))), page([row('1000')]), page([])]
    pages.forEach((value) => mocks.from.mockReturnValueOnce(value))
    const result = await listAllSettingsMasterItems('raw')
    expect(result).toHaveLength(1001)
    expect(result[1000].orderCode).toBe('RM-1000')
    expect(pages.map((value) => value.range.mock.calls[0])).toEqual([[0, 499], [500, 999], [1000, 1499], [1001, 1500]])
    expect(pages[0].order.mock.calls).toEqual([['name_part'], ['id']])
    expect(pages[0].eq).toHaveBeenCalledWith('is_active', true)
    expect(mocks.from).toHaveBeenCalledWith('raw_materials')
  })

  it('continues after short pages and includes inactive rows through the Settings client', async () => {
    const pages = [page([row('1'), row('2')]), page([row('3')]), page([])]
    pages.forEach((value) => mocks.adminFrom.mockReturnValueOnce(value))
    expect(await listAllSettingsMasterItems('equipment', true)).toHaveLength(3)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.adminFrom).toHaveBeenCalledWith('factory_supplies')
    expect(pages[1].range).toHaveBeenCalledWith(2, 501)
    expect(pages[0].eq).not.toHaveBeenCalled()
  })

  it('rejects a later page failure instead of returning incomplete results', async () => {
    mocks.from.mockReturnValueOnce(page([row('1')])).mockReturnValueOnce(page([], new Error('Network')))
    await expect(listAllSettingsMasterItems('raw')).rejects.toThrow('Network')
  })
})
