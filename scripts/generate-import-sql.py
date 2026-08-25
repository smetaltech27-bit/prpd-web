#!/usr/bin/env python3
"""Generate a private, transactional SQL import from the legacy CSV export.

The generated SQL is written below supabase/seed/generated/, which is ignored
by Git. It stages and validates the source rows before performing idempotent
upserts into the three master tables. It never deletes remote rows.
"""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "supabase" / "seed" / "generated"
OUTPUT = GENERATED / "import-masters.sql"


def read_csv(name: str) -> list[dict[str, str]]:
    path = GENERATED / name
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sql_text(value: str | None, *, nullable: bool = True) -> str:
    if value is None or (nullable and value == ""):
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_uuid(value: str | None) -> str:
    return "null" if not value else f"{sql_text(value, nullable=False)}::uuid"


def sql_number(value: str | None) -> str:
    return "null" if value is None or value.strip() == "" else value.strip()


def sql_bool(value: str | None) -> str:
    return "true" if (value or "").strip().lower() in {"true", "1", "yes"} else "false"


def values_sql(rows: list[dict[str, str]], columns: list[str], renderers: dict[str, object]) -> str:
    rendered_rows: list[str] = []
    for row in rows:
        values: list[str] = []
        for column in columns:
            renderer = renderers.get(column, sql_text)
            values.append(renderer(row.get(column)))
        rendered_rows.append("  (" + ", ".join(values) + ")")
    return ",\n".join(rendered_rows)


def build_sql() -> str:
    vendors = read_csv("vendors.csv")
    raw_materials = read_csv("raw_materials.csv")
    factory_supplies = read_csv("factory_supplies.csv")

    vendor_columns = ["id", "name", "legacy_name", "is_active"]
    raw_columns = [
        "id", "name_part", "spec", "dwg_no", "item_fg", "code_order_rm",
        "vendor_id", "material_type", "dimension", "unit_price", "usage_qty",
        "comment", "legacy_source_row", "is_active",
    ]
    supply_columns = [
        "id", "name_part", "spec", "dwg_no", "item_fg", "code_order_rm",
        "vendor_id", "supply_type", "dimension", "unit_price", "usage_qty",
        "comment", "legacy_source_row", "is_active",
    ]
    common_renderers = {
        "id": sql_uuid,
        "vendor_id": sql_uuid,
        "unit_price": sql_number,
        "usage_qty": sql_number,
        "legacy_source_row": sql_number,
        "is_active": sql_bool,
    }

    return f"""-- Generated locally from ignored legacy CSV files. Do not commit this file.
begin;

create temporary table stage_vendors (
  id uuid primary key,
  name text not null,
  legacy_name text,
  is_active boolean not null
) on commit drop;

create temporary table stage_raw_materials (
  id uuid primary key,
  name_part text not null,
  spec text,
  dwg_no text,
  item_fg text not null,
  code_order_rm text,
  vendor_id uuid not null,
  material_type text,
  dimension text,
  unit_price numeric(14,2),
  usage_qty numeric(14,4),
  comment text,
  legacy_source_row integer,
  is_active boolean not null
) on commit drop;

create temporary table stage_factory_supplies (
  id uuid primary key,
  name_part text not null,
  spec text,
  dwg_no text,
  item_fg text,
  code_order_rm text,
  vendor_id uuid not null,
  supply_type text,
  dimension text,
  unit_price numeric(14,2),
  usage_qty numeric(14,4),
  comment text,
  legacy_source_row integer,
  is_active boolean not null
) on commit drop;

insert into stage_vendors ({', '.join(vendor_columns)}) values
{values_sql(vendors, vendor_columns, common_renderers)};

insert into stage_raw_materials ({', '.join(raw_columns)}) values
{values_sql(raw_materials, raw_columns, common_renderers)};

insert into stage_factory_supplies ({', '.join(supply_columns)}) values
{values_sql(factory_supplies, supply_columns, common_renderers)};

do $$
begin
  if (select count(*) from stage_vendors) <> {len(vendors)} then
    raise exception 'Vendor staging count mismatch';
  end if;
  if (select count(*) from stage_raw_materials) <> {len(raw_materials)} then
    raise exception 'Raw-material staging count mismatch';
  end if;
  if (select count(*) from stage_factory_supplies) <> {len(factory_supplies)} then
    raise exception 'Factory-supply staging count mismatch';
  end if;
  if exists (
    select 1 from stage_raw_materials r
    left join stage_vendors v on v.id = r.vendor_id
    where v.id is null
  ) then
    raise exception 'Raw-material staging contains an unknown vendor';
  end if;
  if exists (
    select 1 from stage_factory_supplies s
    left join stage_vendors v on v.id = s.vendor_id
    where v.id is null
  ) then
    raise exception 'Factory-supply staging contains an unknown vendor';
  end if;
end $$;

insert into public.vendors (id, name, legacy_name, is_active)
select id, name, legacy_name, is_active from stage_vendors
on conflict (id) do update set
  name = excluded.name,
  legacy_name = excluded.legacy_name,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.raw_materials ({', '.join(raw_columns)})
select {', '.join(raw_columns)} from stage_raw_materials
on conflict (id) do update set
  name_part = excluded.name_part,
  spec = excluded.spec,
  dwg_no = excluded.dwg_no,
  item_fg = excluded.item_fg,
  code_order_rm = excluded.code_order_rm,
  vendor_id = excluded.vendor_id,
  material_type = excluded.material_type,
  dimension = excluded.dimension,
  unit_price = excluded.unit_price,
  usage_qty = excluded.usage_qty,
  comment = excluded.comment,
  legacy_source_row = excluded.legacy_source_row,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.factory_supplies ({', '.join(supply_columns)})
select {', '.join(supply_columns)} from stage_factory_supplies
on conflict (id) do update set
  name_part = excluded.name_part,
  spec = excluded.spec,
  dwg_no = excluded.dwg_no,
  item_fg = excluded.item_fg,
  code_order_rm = excluded.code_order_rm,
  vendor_id = excluded.vendor_id,
  supply_type = excluded.supply_type,
  dimension = excluded.dimension,
  unit_price = excluded.unit_price,
  usage_qty = excluded.usage_qty,
  comment = excluded.comment,
  legacy_source_row = excluded.legacy_source_row,
  is_active = excluded.is_active,
  updated_at = now();

do $$
begin
  if (select count(*) from public.vendors v join stage_vendors s using (id)) <> {len(vendors)} then
    raise exception 'Vendor merge verification failed';
  end if;
  if (select count(*) from public.raw_materials r join stage_raw_materials s using (id)) <> {len(raw_materials)} then
    raise exception 'Raw-material merge verification failed';
  end if;
  if (select count(*) from public.factory_supplies f join stage_factory_supplies s using (id)) <> {len(factory_supplies)} then
    raise exception 'Factory-supply merge verification failed';
  end if;
end $$;

commit;
"""


def main() -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    sql = build_sql()
    OUTPUT.write_text(sql, encoding="utf-8", newline="\n")
    print(f"Generated {OUTPUT}")


if __name__ == "__main__":
    main()
