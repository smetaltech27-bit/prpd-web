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
    expect(validateNewSettingsPassword('12345', '12345')).toContain('6')
    expect(validateNewSettingsPassword('123456', '654321')).toContain('ไม่ตรงกัน')
    expect(validateNewSettingsPassword('123456', '123456')).toBe('')
  })
})
