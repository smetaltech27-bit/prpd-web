#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultExport = path.resolve(scriptDirectory, '../supabase/seed/generated/legacy-export.json');
const exportPath = path.resolve(process.argv[2] ?? defaultExport);
const payload = JSON.parse(await readFile(exportPath, 'utf8'));
const errors = [];

const requiredCollections = [
  'vendors',
  'raw_materials',
  'factory_supplies',
  'legacy_purchase_history',
  'document_assets',
];

for (const name of requiredCollections) {
  if (!Array.isArray(payload.data?.[name])) errors.push(`Missing data.${name} array`);
}

function duplicates(records, keyOf) {
  const seen = new Set();
  const repeated = new Set();
  for (const record of records) {
    const key = keyOf(record);
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return [...repeated];
}

if (errors.length === 0) {
  const { vendors, raw_materials, factory_supplies, document_assets } = payload.data;
  const vendorIds = new Set(vendors.map((vendor) => vendor.id));
  const duplicateVendorIds = duplicates(vendors, (vendor) => vendor.id);
  const duplicateVendorNames = duplicates(vendors, (vendor) => vendor.name.trim().toLocaleLowerCase('und'));
  const duplicateActiveAssets = duplicates(
    document_assets.filter((asset) => asset.is_active),
    (asset) => `${asset.document_type}:${asset.item_fg.trim().toUpperCase()}`,
  );
  const duplicateStoragePaths = duplicates(
    document_assets,
    (asset) => `${asset.storage_bucket}:${asset.storage_path}`,
  );

  if (duplicateVendorIds.length) errors.push(`Duplicate vendor ids: ${duplicateVendorIds.slice(0, 5)}`);
  if (duplicateVendorNames.length) errors.push(`Duplicate normalized vendors: ${duplicateVendorNames.slice(0, 5)}`);
  if (duplicateActiveAssets.length) errors.push(`Duplicate active assets: ${duplicateActiveAssets.slice(0, 5)}`);
  if (duplicateStoragePaths.length) errors.push(`Duplicate storage paths: ${duplicateStoragePaths.slice(0, 5)}`);

  for (const record of [...raw_materials, ...factory_supplies]) {
    if (!vendorIds.has(record.vendor_id)) errors.push(`Missing vendor ${record.vendor_id} for master ${record.id}`);
    if (!record.name_part?.trim()) errors.push(`Blank name_part for master ${record.id}`);
  }
  for (const record of raw_materials) {
    if (!record.item_fg?.trim()) errors.push(`Blank Raw Material item_fg for ${record.id}`);
  }
  for (const asset of document_assets) {
    const expectedBucket = {
      drawing: 'drawing',
      inprocess: 'inprocess-check-sheet',
      qc: 'qc-check-sheet',
    }[asset.document_type];
    if (asset.storage_bucket !== expectedBucket) errors.push(`Wrong bucket for asset ${asset.id}`);
    if (asset.storage_path.startsWith('/') || asset.storage_path.includes('\\')) {
      errors.push(`Non-normalized storage path for asset ${asset.id}`);
    }
  }
}

if (errors.length) {
  console.error(`Legacy export validation failed (${errors.length} issue(s)):`);
  for (const error of errors.slice(0, 50)) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Legacy export validation passed.');
  console.log(JSON.stringify(payload.counts, null, 2));
  if (payload.warnings?.length) {
    console.log(`Warnings requiring review: ${payload.warnings.length}`);
    for (const warning of payload.warnings) console.log(`- ${warning}`);
  }
}
