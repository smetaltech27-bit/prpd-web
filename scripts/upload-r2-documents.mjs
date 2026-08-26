#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.resolve(projectRoot, '..')
const generatedDir = path.join(projectRoot, 'supabase', 'seed', 'generated')
const manifestPath = path.join(generatedDir, 'storage-upload-manifest.csv')
const metadataPath = path.join(generatedDir, 'document_assets.csv')
const statePath = path.join(generatedDir, 'r2-upload-state.json')
const wranglerPath = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const concurrency = Number(option('--concurrency', '4'))
const limit = Number(option('--limit', '0'))
const dryRun = process.argv.includes('--dry-run')
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
  throw new Error('--concurrency must be an integer from 1 to 12')
}
if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer')

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      field = ''
    } else field += character
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }
  if (!rows.length) return []
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''))
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

async function loadCsv(filename) {
  return parseCsv(await readFile(filename, 'utf8'))
}

async function loadState(manifestHash) {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    if (state.manifestSha256 !== manifestHash) throw new Error('Upload state belongs to a different manifest')
    return state
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return { manifestSha256: manifestHash, completed: {} }
  }
}

let stateWrite = Promise.resolve()
function saveState(state) {
  stateWrite = stateWrite.then(async () => {
    const temporaryPath = `${statePath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, statePath)
  })
  return stateWrite
}

function uploadWithWrangler(entry) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      wranglerPath,
      'r2', 'object', 'put', `${entry.storage_bucket}/${entry.storage_path}`,
      '--file', entry.sourceAbsolute,
      '--content-type', entry.mime_type,
      '--content-disposition', 'inline',
      '--storage-class', 'Standard',
      '--remote',
      '--force',
    ], {
      cwd: projectRoot,
      env: { ...process.env, WRANGLER_LOG: 'error', WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(output.trim().slice(-1500) || `Wrangler exited with code ${code}`))
    })
  })
}

async function main() {
  if (!existsSync(wranglerPath)) throw new Error('Wrangler is not installed; run npm install first')
  const manifestText = await readFile(manifestPath, 'utf8')
  const manifestHash = createHash('sha256').update(manifestText).digest('hex')
  const manifest = parseCsv(manifestText)
  const metadata = await loadCsv(metadataPath)
  const metadataByPath = new Map(metadata.map((row) => [row.storage_path, row]))
  if (manifest.length !== 1752 || metadata.length !== manifest.length) {
    throw new Error(`Expected 1752 manifest and metadata rows, found ${manifest.length} and ${metadata.length}`)
  }

  let totalBytes = 0
  const entries = []
  for (const row of manifest) {
    const details = metadataByPath.get(row.storage_path)
    if (!details) throw new Error(`Missing metadata for ${row.storage_path}`)
    if (row.storage_provider !== 'r2' || row.storage_bucket !== 'prpd-documents') {
      throw new Error(`Invalid R2 destination for ${row.storage_path}`)
    }
    const sourceAbsolute = path.resolve(sourceRoot, row.source_path.replaceAll('/', path.sep))
    if (!sourceAbsolute.startsWith(`${sourceRoot}${path.sep}`)) throw new Error(`Unsafe source path: ${row.source_path}`)
    const sourceStat = await stat(sourceAbsolute)
    const expectedSize = Number(details.size_bytes)
    if (!sourceStat.isFile() || sourceStat.size !== expectedSize) {
      throw new Error(`Source size mismatch: ${row.source_path}`)
    }
    totalBytes += expectedSize
    entries.push({ ...row, ...details, sourceAbsolute, expectedSize })
  }

  const uniquePaths = new Set(entries.map((entry) => entry.storage_path))
  if (uniquePaths.size !== entries.length) throw new Error('Manifest contains duplicate R2 paths')
  if (totalBytes !== 1297315782) throw new Error(`Unexpected source total: ${totalBytes} bytes`)

  const state = await loadState(manifestHash)
  const pending = entries.filter((entry) => !state.completed[entry.storage_path])
  const selected = limit ? pending.slice(0, limit) : pending
  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : 'upload',
    manifestRows: entries.length,
    completed: entries.length - pending.length,
    selected: selected.length,
    totalBytes,
    concurrency,
  }))
  if (dryRun || selected.length === 0) return

  let nextIndex = 0
  let uploaded = 0
  const failures = []
  async function worker() {
    while (nextIndex < selected.length && failures.length === 0) {
      const entry = selected[nextIndex]
      nextIndex += 1
      try {
        await uploadWithWrangler(entry)
        state.completed[entry.storage_path] = {
          sizeBytes: entry.expectedSize,
          checksumSha256: entry.checksum_sha256,
          uploadedAt: new Date().toISOString(),
        }
        await saveState(state)
        uploaded += 1
        if (uploaded % 10 === 0 || uploaded === selected.length) {
          console.log(`Uploaded ${uploaded}/${selected.length}; total complete ${Object.keys(state.completed).length}/${entries.length}`)
        }
      } catch (error) {
        failures.push({ path: entry.storage_path, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()))
  await stateWrite
  if (failures.length) throw new Error(`Upload failed for ${failures[0].path}: ${failures[0].message}`)
  console.log(`R2 upload complete: ${Object.keys(state.completed).length}/${entries.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
