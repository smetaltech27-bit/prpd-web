export type SettingsAuthFlow = 'invite' | 'recovery' | null

export function detectSettingsAuthFlow(hash: string): SettingsAuthFlow {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash
  const type = new URLSearchParams(normalized).get('type')
  return type === 'invite' || type === 'recovery' ? type : null
}

export const initialSettingsAuthFlow = typeof window === 'undefined'
  ? null
  : detectSettingsAuthFlow(window.location.hash)

export function validateNewSettingsPassword(password: string, confirmation: string): string {
  if (password.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
  if (password !== confirmation) return 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
  return ''
}
