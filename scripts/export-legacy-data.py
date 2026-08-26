#!/usr/bin/env python3
"""Export PRPD legacy XLSX/JPG data without writing to Supabase.

This script intentionally uses only the Python standard library. It produces
reviewable CSV/JSON files and a normalized Storage upload manifest.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import re
import unicodedata
import uuid
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from xml.etree import ElementTree as ET


NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
UUID_NAMESPACE = uuid.UUID("0ad3b5db-b403-48c8-a90d-3c7b4e42cafe")

MASTER_COLUMNS = (
    "name_part",
    "spec",
    "dwg_no",
    "item_fg",
    "code_order_rm",
    "vendor_name",
    "item_type",
    "dimension",
    "unit_price",
    "usage_qty",
    "comment",
)

ASSET_SOURCES = (
    ("drawing", "prpd-documents", "DRAWING"),
    ("inprocess", "prpd-documents", "INPROCESS CHECK SHEET"),
    ("qc", "prpd-documents", "QC CHECK SHEET"),
)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = unicodedata.normalize("NFKC", str(value)).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def nullable_text(value: Any) -> str:
    text = clean_text(value)
    return "" if text in {"", "-"} else text


def normalized_key(value: Any) -> str:
    return clean_text(value).casefold()


def number_or_blank(value: Any) -> str | int | float:
    if value is None or clean_text(value) in {"", "-"}:
        return ""
    if isinstance(value, (int, float)):
        return int(value) if isinstance(value, float) and value.is_integer() else value
    text = clean_text(value).replace(",", "")
    try:
        number = float(text)
        return int(number) if number.is_integer() else number
    except ValueError:
        return text


def excel_date(value: Any) -> str:
    if value is None or clean_text(value) == "":
        return ""
    if isinstance(value, (int, float)):
        # Excel's 1900 date system includes the historical leap-year bug.
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()
    text = clean_text(value)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    return text


def column_index(reference: str) -> int:
    letters = "".join(ch for ch in reference if ch.isalpha()).upper()
    result = 0
    for char in letters:
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


class XlsxReader:
    """Small read-only XLSX reader sufficient for the PRPD legacy workbooks."""

    def __init__(self, path: Path):
        self.path = path
        self.archive = zipfile.ZipFile(path)
        self.shared_strings = self._read_shared_strings()
        self.sheet_paths = self._read_sheet_paths()

    def close(self) -> None:
        self.archive.close()

    def __enter__(self) -> "XlsxReader":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _read_shared_strings(self) -> list[str]:
        try:
            root = ET.fromstring(self.archive.read("xl/sharedStrings.xml"))
        except KeyError:
            return []
        strings: list[str] = []
        for item in root.findall(f"{{{NS_MAIN}}}si"):
            strings.append("".join(node.text or "" for node in item.iter(f"{{{NS_MAIN}}}t")))
        return strings

    def _read_sheet_paths(self) -> dict[str, str]:
        workbook = ET.fromstring(self.archive.read("xl/workbook.xml"))
        relations = ET.fromstring(self.archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in relations.findall(f"{{{NS_REL_PKG}}}Relationship")
        }
        result: dict[str, str] = {}
        sheets = workbook.find(f"{{{NS_MAIN}}}sheets")
        if sheets is None:
            return result
        for sheet in sheets:
            rel_id = sheet.attrib[f"{{{NS_REL_DOC}}}id"]
            target = targets[rel_id].lstrip("/")
            if not target.startswith("xl/"):
                target = str(PurePosixPath("xl") / target)
            result[sheet.attrib["name"]] = target
        return result

    def rows(self, sheet_name: str) -> list[list[Any]]:
        if sheet_name not in self.sheet_paths:
            raise KeyError(f"Sheet {sheet_name!r} not found in {self.path.name}")
        root = ET.fromstring(self.archive.read(self.sheet_paths[sheet_name]))
        data = root.find(f"{{{NS_MAIN}}}sheetData")
        if data is None:
            return []
        output: list[list[Any]] = []
        for row in data.findall(f"{{{NS_MAIN}}}row"):
            values: dict[int, Any] = {}
            for cell in row.findall(f"{{{NS_MAIN}}}c"):
                index = column_index(cell.attrib.get("r", "A1"))
                kind = cell.attrib.get("t")
                value_node = cell.find(f"{{{NS_MAIN}}}v")
                if kind == "inlineStr":
                    inline = cell.find(f"{{{NS_MAIN}}}is")
                    value: Any = "" if inline is None else "".join(
                        node.text or "" for node in inline.iter(f"{{{NS_MAIN}}}t")
                    )
                elif value_node is None:
                    value = None
                elif kind == "s":
                    value = self.shared_strings[int(value_node.text or "0")]
                elif kind in {"str", "e"}:
                    value = value_node.text or ""
                elif kind == "b":
                    value = value_node.text == "1"
                else:
                    raw = value_node.text or ""
                    try:
                        number = float(raw)
                        value = int(number) if number.is_integer() else number
                    except ValueError:
                        value = raw
                values[index] = value
            width = max(values, default=-1) + 1
            output.append([values.get(index) for index in range(width)])
        return output


def stable_uuid(*parts: Any) -> str:
    material = "/".join(normalized_key(part) for part in parts)
    return str(uuid.uuid5(UUID_NAMESPACE, material))


def row_value(row: list[Any], index: int) -> Any:
    return row[index] if index < len(row) else None


def master_records(path: Path, kind: str) -> list[dict[str, Any]]:
    with XlsxReader(path) as workbook:
        rows = workbook.rows("Sheet1")
    records: list[dict[str, Any]] = []
    for source_row, row in enumerate(rows[1:], start=2):
        values = dict(zip(MASTER_COLUMNS, (row_value(row, i) for i in range(11))))
        if not any(clean_text(value) for value in values.values()):
            continue
        records.append(
            {
                "id": stable_uuid("master", kind, source_row, values["name_part"], values["item_fg"]),
                "legacy_source_row": source_row,
                "name_part": clean_text(values["name_part"]),
                "spec": nullable_text(values["spec"]),
                "dwg_no": nullable_text(values["dwg_no"]),
                "item_fg": nullable_text(values["item_fg"]).upper(),
                "code_order_rm": nullable_text(values["code_order_rm"]),
                "vendor_name": clean_text(values["vendor_name"]),
                "item_type": nullable_text(values["item_type"]),
                "dimension": nullable_text(values["dimension"]),
                "unit_price": number_or_blank(values["unit_price"]),
                "usage_qty": number_or_blank(values["usage_qty"]),
                "comment": nullable_text(values["comment"]),
                "is_active": True,
            }
        )
    return records


def history_records(path: Path) -> list[dict[str, Any]]:
    with XlsxReader(path) as workbook:
        rows = workbook.rows("history")
    result: list[dict[str, Any]] = []
    for source_row, row in enumerate(rows[1:], start=2):
        if not any(clean_text(row_value(row, i)) for i in range(min(len(row), 13))):
            continue
        old_number = clean_text(row_value(row, 11))
        normalized_pr = f"PR-{old_number}" if re.fullmatch(r"\d{4}-\d{4,}", old_number) else ""
        result.append(
            {
                "legacy_source_row": source_row,
                "vendor_name": clean_text(row_value(row, 0)),
                "item_fg": nullable_text(row_value(row, 1)).upper(),
                "code_order_rm": nullable_text(row_value(row, 2)),
                "name_part": clean_text(row_value(row, 3)),
                "item_type": nullable_text(row_value(row, 4)),
                "spec_legacy": nullable_text(row_value(row, 5)),
                "fg_qty": number_or_blank(row_value(row, 6)),
                "quantity": number_or_blank(row_value(row, 7)),
                "unit_price": number_or_blank(row_value(row, 8)),
                "due_date": excel_date(row_value(row, 9)),
                "comment": nullable_text(row_value(row, 10)),
                "legacy_number": old_number,
                "normalized_pr_number": normalized_pr,
                "request_date": excel_date(row_value(row, 12)),
            }
        )
    return result


def storage_slug(item_fg: str) -> str:
    ascii_key = unicodedata.normalize("NFKD", item_fg).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", ascii_key).strip("-._").lower()
    return slug or hashlib.sha256(item_fg.encode("utf-8")).hexdigest()[:20]


def asset_records(source_root: Path, with_checksums: bool) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    grouped: dict[tuple[str, str], list[Path]] = defaultdict(list)

    for document_type, _, folder_name in ASSET_SOURCES:
        folder = source_root / folder_name
        if not folder.is_dir():
            warnings.append(f"Missing asset folder: {folder}")
            continue
        for path in sorted((p for p in folder.rglob("*") if p.is_file()), key=lambda p: p.name.casefold()):
            item_fg = clean_text(path.stem).upper()
            if not item_fg:
                warnings.append(f"Skipped empty asset filename: {path}")
                continue
            grouped[(document_type, item_fg)].append(path)

    bucket_by_type = {document_type: bucket for document_type, bucket, _ in ASSET_SOURCES}
    for (document_type, item_fg), paths in sorted(grouped.items()):
        for version, path in enumerate(paths, start=1):
            extension = path.suffix.lower() or ".bin"
            mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            slug = storage_slug(item_fg)
            storage_path = f"{document_type}/{slug}/v{version:03d}/{slug}{extension}"
            checksum = ""
            if with_checksums:
                digest = hashlib.sha256()
                with path.open("rb") as source:
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        digest.update(block)
                checksum = digest.hexdigest()
            records.append(
                {
                    "id": stable_uuid("asset", document_type, item_fg, version),
                    "item_fg": item_fg,
                    "document_type": document_type,
                    "version": version,
                    "storage_provider": "r2",
                    "storage_bucket": bucket_by_type[document_type],
                    "storage_path": storage_path,
                    "original_filename": path.name,
                    "mime_type": mime_type,
                    "size_bytes": path.stat().st_size,
                    "checksum_sha256": checksum,
                    "is_active": version == len(paths),
                    "source_path": path.relative_to(source_root).as_posix(),
                }
            )
    return records, warnings


def write_csv(path: Path, records: list[dict[str, Any]], columns: Iterable[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=list(columns), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)


def export(args: argparse.Namespace) -> dict[str, Any]:
    source_root = args.source_root.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    raw = master_records(source_root / "master material.xlsx", "raw_material")
    supplies = master_records(source_root / "master factory supply.xlsx", "factory_supply")
    history = history_records(source_root / "Order RM.xlsx")
    assets, warnings = asset_records(source_root, args.with_checksums)

    vendor_names: dict[str, str] = {}
    for record in [*raw, *supplies, *history]:
        name = clean_text(record.get("vendor_name"))
        key = normalized_key(name)
        if not key:
            warnings.append(f"Missing vendor name in source row {record.get('legacy_source_row')}")
            continue
        vendor_names.setdefault(key, name)

    vendors = [
        {
            "id": stable_uuid("vendor", key),
            "name": name,
            "legacy_name": name,
            "is_active": True,
        }
        for key, name in sorted(vendor_names.items())
    ]
    vendor_id_by_key = {normalized_key(row["name"]): row["id"] for row in vendors}

    for record in [*raw, *supplies]:
        record["vendor_id"] = vendor_id_by_key.get(normalized_key(record.pop("vendor_name")), "")

    raw_db: list[dict[str, Any]] = []
    for record in raw:
        converted = dict(record)
        converted["material_type"] = converted.pop("item_type")
        raw_db.append(converted)

    supply_db: list[dict[str, Any]] = []
    for record in supplies:
        converted = dict(record)
        converted["supply_type"] = converted.pop("item_type")
        supply_db.append(converted)

    known_item_fg = {row["item_fg"] for row in raw_db if row["item_fg"]}
    orphan_assets = sorted({row["item_fg"] for row in assets if row["item_fg"] not in known_item_fg})
    if orphan_assets:
        warnings.append(f"{len(orphan_assets)} asset Item FG values are not present in Raw Material master")

    asset_counts = Counter(row["document_type"] for row in assets)
    duplicate_active = [
        f"{kind}:{item_fg}"
        for (kind, item_fg), count in Counter(
            (row["document_type"], row["item_fg"]) for row in assets if row["is_active"]
        ).items()
        if count != 1
    ]
    if duplicate_active:
        warnings.append(f"Duplicate active asset keys: {', '.join(duplicate_active[:10])}")

    write_csv(output / "vendors.csv", vendors, ("id", "name", "legacy_name", "is_active"))
    write_csv(
        output / "raw_materials.csv",
        raw_db,
        (
            "id", "name_part", "spec", "dwg_no", "item_fg", "code_order_rm", "vendor_id",
            "material_type", "dimension", "unit_price", "usage_qty", "comment",
            "legacy_source_row", "is_active",
        ),
    )
    write_csv(
        output / "factory_supplies.csv",
        supply_db,
        (
            "id", "name_part", "spec", "dwg_no", "item_fg", "code_order_rm", "vendor_id",
            "supply_type", "dimension", "unit_price", "usage_qty", "comment",
            "legacy_source_row", "is_active",
        ),
    )
    write_csv(
        output / "legacy_purchase_history.csv",
        history,
        (
            "legacy_source_row", "vendor_name", "item_fg", "code_order_rm", "name_part",
            "item_type", "spec_legacy", "fg_qty", "quantity", "unit_price", "due_date",
            "comment", "legacy_number", "normalized_pr_number", "request_date",
        ),
    )
    write_csv(
        output / "document_assets.csv",
        assets,
        (
            "id", "item_fg", "document_type", "version", "storage_provider", "storage_bucket", "storage_path",
            "original_filename", "mime_type", "size_bytes", "checksum_sha256", "is_active",
        ),
    )
    write_csv(
        output / "storage-upload-manifest.csv",
        assets,
        ("source_path", "storage_provider", "storage_bucket", "storage_path", "item_fg", "document_type", "version", "is_active"),
    )

    payload = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_root": str(source_root),
        "counts": {
            "vendors": len(vendors),
            "raw_materials": len(raw_db),
            "factory_supplies": len(supply_db),
            "legacy_history_lines": len(history),
            "document_assets": dict(sorted(asset_counts.items())),
        },
        "orphan_asset_item_fg": orphan_assets,
        "warnings": sorted(set(warnings)),
        "data": {
            "vendors": vendors,
            "raw_materials": raw_db,
            "factory_supplies": supply_db,
            "legacy_purchase_history": history,
            "document_assets": assets,
        },
    }
    (output / "legacy-export.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "summary.json").write_text(
        json.dumps({key: value for key, value in payload.items() if key != "data"}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    source_root = project_root.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=source_root)
    parser.add_argument("--output", type=Path, default=project_root / "supabase" / "seed" / "generated")
    parser.add_argument(
        "--with-checksums",
        action="store_true",
        help="Hash every asset (slower, but recommended before the final upload).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    result = export(parse_args())
    print(json.dumps({"counts": result["counts"], "warnings": result["warnings"]}, ensure_ascii=False, indent=2))
