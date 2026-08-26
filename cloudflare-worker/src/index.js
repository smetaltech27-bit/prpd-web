const DOCUMENT_ROUTE_PREFIX = '/v1/documents/'
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

function json(body, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function parseAllowedOrigins(value) {
  return new Set(String(value || '').split(',').map((origin) => origin.trim()).filter(Boolean))
}

export function corsHeaders(origin, allowedOrigins) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type, x-original-filename',
    'access-control-allow-methods': 'GET, HEAD, PUT, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  })
  if (origin && allowedOrigins.has(origin)) headers.set('access-control-allow-origin', origin)
  return headers
}

export function objectKeyFromPath(pathname) {
  if (!pathname.startsWith(DOCUMENT_ROUTE_PREFIX)) return null
  const encodedKey = pathname.slice(DOCUMENT_ROUTE_PREFIX.length)
  if (!encodedKey) return null
  let key
  try {
    key = encodedKey.split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
  if (
    key.startsWith('/')
    || key.includes('\\')
    || key.split('/').some((part) => !part || part === '.' || part === '..')
  ) return null
  return key
}

function base64UrlBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)))
}

function bearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function verifyWithJwk(token, header, jwk) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  const signature = base64UrlBytes(encodedSignature)
  if (header.alg === 'ES256' && jwk.kty === 'EC') {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data)
  }
  if (header.alg === 'RS256' && jwk.kty === 'RSA') {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
  }
  return false
}

async function verifyViaAuthServer(token, env) {
  if (!env.SUPABASE_PUBLISHABLE_KEY) return null
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) return null
  const user = await response.json()
  return user?.id ? { sub: user.id, role: 'authenticated', is_anonymous: Boolean(user.is_anonymous) } : null
}

export async function verifyAccessToken(token, env) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let header
  let claims
  try {
    header = decodeJwtPart(parts[0])
    claims = decodeJwtPart(parts[1])
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  const expectedIssuer = `${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1`
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    !claims.sub
    || claims.iss !== expectedIssuer
    || claims.role !== 'authenticated'
    || !audience.includes('authenticated')
    || typeof claims.exp !== 'number'
    || claims.exp <= now
    || (typeof claims.nbf === 'number' && claims.nbf > now + 30)
  ) return null

  if (header.alg === 'HS256') return verifyViaAuthServer(token, env)
  if (!['ES256', 'RS256'].includes(header.alg) || !header.kid) return null

  try {
    const response = await fetch(`${expectedIssuer}/.well-known/jwks.json`, {
      cf: { cacheEverything: true, cacheTtl: 600 },
    })
    if (!response.ok) return null
    const jwks = await response.json()
    const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.alg === header.alg)
    if (!jwk || !(await verifyWithJwk(token, header, jwk))) return null
    return claims
  } catch {
    return null
  }
}

async function isSettingsAdmin(token, env) {
  if (!env.SUPABASE_PUBLISHABLE_KEY) return false
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_settings_admin`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: '{}',
  })
  return response.ok && await response.json() === true
}

export async function canReadDocument(token, env, key) {
  if (!env.SUPABASE_PUBLISHABLE_KEY) return false
  const query = new URLSearchParams({
    select: 'id',
    storage_provider: 'eq.r2',
    storage_bucket: 'eq.prpd-documents',
    storage_path: `eq.${key}`,
    is_active: 'eq.true',
    limit: '1',
  })
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/document_assets?${query}`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) return false
  const rows = await response.json()
  return Array.isArray(rows) && rows.length === 1
}

function withCors(response, origin, allowedOrigins) {
  const headers = new Headers(response.headers)
  corsHeaders(origin, allowedOrigins).forEach((value, name) => headers.set(name, value))
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function readObject(request, env, key) {
  const object = request.method === 'HEAD'
    ? await env.DOCUMENTS.head(key)
    : await env.DOCUMENTS.get(key, { onlyIf: request.headers, range: request.headers })
  if (!object) return json({ error: 'Document not found' }, { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=300')
  headers.set('content-disposition', 'inline')
  headers.set('accept-ranges', 'bytes')
  if (request.method === 'HEAD') return new Response(null, { headers })
  if (!object.body) return new Response(null, { status: 412, headers })
  let status = 200
  if (object.range && 'offset' in object.range && 'length' in object.range) {
    const end = object.range.offset + object.range.length - 1
    headers.set('content-range', `bytes ${object.range.offset}-${end}/${object.size}`)
    status = 206
  }
  return new Response(object.body, { status, headers })
}

async function writeObject(request, env, key, token) {
  if (!(await isSettingsAdmin(token, env))) return json({ error: 'Settings administrator required' }, { status: 403 })
  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
  const declaredLength = request.headers.get('content-length')
  const contentLength = declaredLength === null ? null : Number(declaredLength)
  const maxBytes = Number(env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024)
  if (!ALLOWED_MIME_TYPES.has(contentType)) return json({ error: 'Unsupported document type' }, { status: 415 })
  if (!request.body) return json({ error: 'Document body is required' }, { status: 400 })
  if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength <= 0)) return json({ error: 'Invalid Content-Length' }, { status: 400 })
  if (contentLength !== null && contentLength > maxBytes) return json({ error: 'Document exceeds upload limit' }, { status: 413 })
  const allowedPrefix = /^(drawing|inprocess|qc)\/[a-z0-9._-]+\/revisions\/[a-f0-9-]+\.(jpg|jpeg|png|webp|pdf)$/
  if (!allowedPrefix.test(key)) return json({ error: 'Invalid immutable document path' }, { status: 400 })

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) return json({ error: 'Document body is required' }, { status: 400 })
  if (bytes.byteLength > maxBytes) return json({ error: 'Document exceeds upload limit' }, { status: 413 })

  const stored = await env.DOCUMENTS.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType },
    customMetadata: {
      originalFilename: (request.headers.get('x-original-filename') || '').slice(0, 512),
    },
  })
  if (!stored) return json({ error: 'Immutable document path already exists' }, { status: 409 })
  return json({ key }, { status: 201 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('origin') || ''
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS)
    if (origin && !allowedOrigins.has(origin)) return json({ error: 'Origin is not allowed' }, { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigins) })
    if (url.pathname === '/health' && request.method === 'GET') {
      return withCors(json({ ok: true, storage: 'r2-private' }), origin, allowedOrigins)
    }

    const key = objectKeyFromPath(url.pathname)
    if (!key || !['GET', 'HEAD', 'PUT'].includes(request.method)) {
      return withCors(json({ error: 'Not found' }, { status: 404 }), origin, allowedOrigins)
    }
    const token = bearerToken(request)
    if (!token || !(await verifyAccessToken(token, env))) {
      return withCors(json({ error: 'Valid Supabase session required' }, { status: 401 }), origin, allowedOrigins)
    }

    if (request.method !== 'PUT' && !(await canReadDocument(token, env, key))) {
      return withCors(json({ error: 'Document not found' }, { status: 404 }), origin, allowedOrigins)
    }

    try {
      const response = request.method === 'PUT'
        ? await writeObject(request, env, key, token)
        : await readObject(request, env, key)
      return withCors(response, origin, allowedOrigins)
    } catch (error) {
      console.error(JSON.stringify({ event: 'document_gateway_error', method: request.method, key, message: error instanceof Error ? error.message : String(error) }))
      return withCors(json({ error: 'Document gateway failed' }, { status: 500 }), origin, allowedOrigins)
    }
  },
}
