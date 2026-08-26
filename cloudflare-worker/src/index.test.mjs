import assert from 'node:assert/strict'
import test from 'node:test'
import { canReadDocument, corsHeaders, objectKeyFromPath, parseAllowedOrigins, verifyAccessToken } from './index.js'

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

test('accepts only safe immutable object paths', () => {
  assert.equal(objectKeyFromPath('/v1/documents/drawing/tm4207a/revisions/abc-123.jpg'), 'drawing/tm4207a/revisions/abc-123.jpg')
  assert.equal(objectKeyFromPath('/v1/documents/drawing/../secret.jpg'), null)
  assert.equal(objectKeyFromPath('/v1/documents/drawing%5Csecret.jpg'), null)
  assert.equal(objectKeyFromPath('/other/path'), null)
})

test('returns CORS only for an explicitly allowed origin', () => {
  const allowed = parseAllowedOrigins('https://example.com, http://localhost:5173')
  assert.equal(corsHeaders('https://example.com', allowed).get('access-control-allow-origin'), 'https://example.com')
  assert.equal(corsHeaders('https://evil.example', allowed).get('access-control-allow-origin'), null)
})

test('verifies a current authenticated Supabase ES256 token', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  Object.assign(jwk, { kid: 'test-key', alg: 'ES256', use: 'sig' })
  const header = base64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256', kid: 'test-key' }))
  const payload = base64Url(JSON.stringify({
    iss: 'https://project.supabase.co/auth/v1',
    aud: 'authenticated',
    sub: '00000000-0000-0000-0000-000000000001',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300,
    is_anonymous: true,
  }))
  const data = new TextEncoder().encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, data)
  const token = `${header}.${payload}.${base64Url(signature)}`
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ keys: [jwk] })
  try {
    const claims = await verifyAccessToken(token, { SUPABASE_URL: 'https://project.supabase.co' })
    assert.equal(claims?.sub, '00000000-0000-0000-0000-000000000001')
    assert.equal(claims?.is_anonymous, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects an expired token before fetching signing keys', async () => {
  const header = base64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256', kid: 'test-key' }))
  const payload = base64Url(JSON.stringify({
    iss: 'https://project.supabase.co/auth/v1',
    aud: 'authenticated',
    sub: 'expired',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) - 1,
  }))
  assert.equal(await verifyAccessToken(`${header}.${payload}.invalid`, { SUPABASE_URL: 'https://project.supabase.co' }), null)
})

test('authorizes an R2 key only when active metadata is visible through Supabase RLS', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input)
    assert.equal(init.headers.authorization, 'Bearer test-token')
    return Response.json([{ id: 'asset-id' }])
  }
  try {
    assert.equal(await canReadDocument('test-token', {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    }, 'drawing/tm4207a/v001/tm4207a.jpg'), true)
    const url = new URL(requestedUrl)
    assert.equal(url.searchParams.get('storage_path'), 'eq.drawing/tm4207a/v001/tm4207a.jpg')
    assert.equal(url.searchParams.get('is_active'), 'eq.true')
  } finally {
    globalThis.fetch = originalFetch
  }
})
