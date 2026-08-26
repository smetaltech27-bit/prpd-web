import { describe, expect, it } from 'vitest'
import { detectSettingsAuthFlow, validateNewSettingsPassword } from './settingsInvite'

describe('detectSettingsAuthFlow', () => {
  it('recognizes invite and recovery links only', () => {
    expect(detectSettingsAuthFlow('#access_token=token&type=invite')).toBe('invite')
    expect(detectSettingsAuthFlow('type=recovery&access_token=token')).toBe('recovery')
    expect(detectSettingsAuthFlow('#type=signup')).toBeNull()
    expect(detectSettingsAuthFlow('')).toBeNull()
  })
})

describe('validateNewSettingsPassword', () => {
  it('requires a strong matching password', () => {
    expect(validateNewSettingsPassword('Short1', 'Short1')).toContain('12')
    expect(validateNewSettingsPassword('alllowercase123', 'alllowercase123')).toContain('ตัวพิมพ์ใหญ่')
    expect(validateNewSettingsPassword('StrongPassword123', 'StrongPassword124')).toContain('ไม่ตรงกัน')
    expect(validateNewSettingsPassword('StrongPassword123', 'StrongPassword123')).toBe('')
  })
})
