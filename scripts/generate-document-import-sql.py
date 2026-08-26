#!/usr/bin/env python3
"""Generate an ignored transactional metadata import for R2 document assets."""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "supabase" / "seed" / "generated"
OUTPUT = GENERATED / "import-documents.sql"


def sql_text(value: str | None, *, nullable: bool = True) -> str:
    if value is None or (nullable and value == ""):
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_number(value: str | None) -> str:
    return "null" if value is None or value.strip() == "" else value.strip()


def sql_bool(value: str | None) -> str:
    return "true" if (value or "").strip().lower() in {"true", "1", "yes"} else "false"


def build_sql() -> tuple[str, int]:
    with (GENERATED / "document_assets.csv").open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit("No document metadata rows were generated")
    invalid = [row for row in rows if row.get("storage_provider") != "r2" or row.get("storage_bucket") != "prpd-documents"]
    if invalid:
        raise SystemExit("Generated metadata contains a non-R2 document location")

    values = []
    for row in rows:
        values.append("  (" + ", ".join([
            f"{sql_text(row['id'], nullable=False)}::uuid",
            sql_text(row["item_fg"], nullable=False),
            f"{sql_text(row['document_type'], nullable=False)}::public.document_kind",
            sql_number(row["version"]),
            sql_text(row["storage_provider"], nullable=False),
            sql_text(row["storage_bucket"], nullable=False),
            sql_text(row["storage_path"], nullable=False),
            sql_text(row["original_filename"], nullable=False),
            sql_text(row.get("mime_type")),
            sql_number(row.get("size_bytes")),
            sql_text(row.get("checksum_sha256")),
            sql_bool(row.get("is_active")),
        ]) + ")")

    count = len(rows)
    value_sql = ",\n".join(values)
    sql = f"""-- Generated from ignored local manifests. Do not commit this file.
begin;

create temporary table stage_document_assets (
  id uuid primary key,
  item_fg text not null,
  document_type public.document_kind not null,
  version integer not null,
  storage_provider text not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  is_active boolean not null
) on commit drop;

insert into stage_document_assets values
{value_sql};

do $$
begin
  if (select count(*) from stage_document_assets) <> {count} then
    raise exception 'Document staging count mismatch';
  end if;
  if exists (
    select 1 from stage_document_assets
    where storage_provider <> 'r2'
       or storage_bucket <> 'prpd-documents'
       or storage_path !~ '^(drawing|inprocess|qc)/'
  ) then
    raise exception 'Document staging contains an invalid R2 location';
  end if;
  if exists (
    select 1 from stage_document_assets
    group by storage_provider, storage_bucket, storage_path
    having count(*) > 1
  ) then
    raise exception 'Document staging contains duplicate object paths';
  end if;
end $$;

insert into public.document_assets (
  id, item_fg, document_type, version, storage_provider, storage_bucket,
  storage_path, original_filename, mime_type, size_bytes, checksum_sha256, is_active
)
select
  id, item_fg, document_type, version, storage_provider, storage_bucket,
  storage_path, original_filename, mime_type, size_bytes, checksum_sha256, is_active
from stage_document_assets
order by item_fg, document_type, version
on conflict (id) do update set
  item_fg = excluded.item_fg,
  document_type = excluded.document_type,
  version = excluded.version,
  storage_provider = excluded.storage_provider,
  storage_bucket = excluded.storage_bucket,
  storage_path = excluded.storage_path,
  original_filename = excluded.original_filename,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes,
  checksum_sha256 = excluded.checksum_sha256,
  is_active = excluded.is_active,
  updated_at = now();

do $$
begin
  if (
    select count(*)
    from public.document_assets target
    join stage_document_assets source using (id)
    where target.storage_provider = 'r2'
  ) <> {count} then
    raise exception 'Document metadata merge verification failed';
  end if;
end $$;

commit;
"""
    return sql, count


def main() -> None:
    sql, count = build_sql()
    OUTPUT.write_text(sql, encoding="utf-8", newline="\n")
    print(f"Generated {OUTPUT} with {count} document rows")


if __name__ == "__main__":
    main()
