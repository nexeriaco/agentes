#!/usr/bin/env python3
"""Generate data/agent_instructions_cleaned.csv from the Supabase snapshot."""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "agent_instructions_rows.csv"
OUT = ROOT / "data" / "agent_instructions_cleaned.csv"
SUMMARY = ROOT / "data" / "agent_instructions_cleaned_summary.md"

ANNUAL_KEEP_GROUPS = {
    "Presupuestos participativos",
    "Videoacta plenos legislatura (actas)",
}
GENERAL_SUB = "General (carpeta principal)"

MODEL_BOILERPLATE_MARKERS = (
    "Este es un documento oficial",
    "Descárgalo y léelo",
    "traslada al modelo",
    "Accede a él y consúltalo: traslada",
)

# IDs from similarity analysis / known pairs
CITA_KEEP_ID = "64035854-6535-41dd-a44a-f967d42be357"  # catálogo
CITA_DROP_ID = "9a462110-6c76-4c83-9546-f4147fb64d9d"  # presencial
QUEJAS_KEEP_ID = "f6c39fb0-7f5c-4c87-88a1-1be6ca4e7259"  # catálogo
QUEJAS_DROP_ID = "dd367885-23fb-441e-af19-0def96115ae9"  # acceso directo

ANIMAL_DIRECTO_DROP_ID = "bfce1375-d145-4b81-81e3-4d5b6adae89b"
DEPORTES_DIRECTO_DROP_ID = "8d307170-de22-4e5b-8810-6545bf77bee8"
COMERCIO_DIRECTO_DROP_ID = "38acd91f-8094-4620-8b7c-0e4fbf37a0b3"

OVT_IMPUESTOS_ID = "1d317d7c-afbf-4623-b975-b3817c6b9ab5"
OVT_TASAS_ID = "a7c42b0f-f026-43eb-8a3a-1f23d40dc2bc"

OUT_FIELDS = [
    "id",
    "agent_id",
    "case_group",
    "case_subgroup",
    "instruction",
    "associated_url",
    "allow_url_reading",
    "active",
    "horas_cache_pagina",
    "response_mode",
    "change_action",
    "change_note",
]


def parse_bool(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"true", "1", "t", "yes"}


def fmt_bool(value: bool) -> str:
    return "true" if value else "false"


def has_model_boilerplate(text: str) -> bool:
    return any(m in (text or "") for m in MODEL_BOILERPLATE_MARKERS)


def short_norma_instruction(subgroup: str, url: str) -> str:
    title = re.sub(r"^NORMA\s*·\s*", "", subgroup or "").strip() or "documento oficial"
    url = (url or "").strip()
    return (
        f"Documento oficial del Ayuntamiento de Alguazas: {title}. "
        f"Descárgalo y léelo desde este enlace exacto (cópialo tal cual, no inventes otra URL): {url} "
        f"Responde con datos literales del documento (importes, plazos, artículos). "
        f"Si no queda claro, dilo. Tono cercano. Termina citando el enlace: {url}"
    )


def short_tramite_instruction(subgroup: str, url: str) -> str:
    title = re.sub(r"^(TRÁMITE|CONTACTO)\s*·\s*", "", subgroup or "", flags=re.I).strip() or "este trámite"
    url = (url or "").strip()
    return (
        f"Trámite o recurso municipal: {title}. "
        f"Consulta la información actualizada en: {url} "
        f"Extrae solo lo necesario para responder al ciudadano con tono cercano. "
        f"Termina con una coletilla que incluya este enlace: {url}"
    )


def is_presupuestos_year_row(subgroup: str) -> bool:
    s = subgroup or ""
    if s == GENERAL_SUB:
        return False
    if re.search(r"PRESUPUESTOS PARTICIPATIVOS\s+20\d{2}", s, re.I):
        return True
    if re.search(r"MEMORIA PRESUPUESTOS PARTICIPATIVOS\s+20\d{2}", s, re.I):
        return True
    return False


def is_presupuestos_keep(subgroup: str) -> bool:
    s = subgroup or ""
    return s == GENERAL_SUB or bool(re.search(r"PRESUPUESTOS PARTICIPATIVOS\s+2025\b", s, re.I))


def is_videoacta_year_row(subgroup: str) -> bool:
    s = subgroup or ""
    if s == GENERAL_SUB:
        return False
    return bool(re.search(r"Actas y v[ií]deos del pleno de 20\d{2}", s, re.I))


def is_videoacta_keep(subgroup: str) -> bool:
    s = subgroup or ""
    return s == GENERAL_SUB or bool(re.search(r"Actas y v[ií]deos del pleno de 2025\b", s, re.I))


def mark(row: dict, action: str, note: str) -> None:
    prev = row.get("change_action") or "unchanged"
    if prev == "unchanged":
        row["change_action"] = action
        row["change_note"] = note
    else:
        row["change_action"] = f"{prev}+{action}"
        row["change_note"] = f"{row.get('change_note', '')}; {note}".strip("; ")


def load_rows() -> list[dict]:
    rows: list[dict] = []
    with SRC.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            rows.append(
                {
                    "id": (raw.get("id") or "").strip(),
                    "agent_id": (raw.get("agent_id") or "").strip(),
                    "case_group": (raw.get("case_group") or "").strip(),
                    "case_subgroup": (raw.get("case_subgroup") or "").strip(),
                    "instruction": raw.get("instruction") or "",
                    "associated_url": (raw.get("associated_url") or "").strip(),
                    "allow_url_reading": parse_bool(raw.get("allow_url_reading")),
                    "active": parse_bool(raw.get("active")),
                    "horas_cache_pagina": (raw.get("horas_cache_pagina") or "").strip(),
                    "response_mode": (raw.get("response_mode") or "").strip().lower(),
                    "change_action": "unchanged",
                    "change_note": "",
                }
            )
    return rows


def apply_1b(rows: list[dict]) -> None:
    for row in rows:
        group = row["case_group"]
        sub = row["case_subgroup"]
        if group == "Presupuestos participativos":
            if is_presupuestos_year_row(sub) and not is_presupuestos_keep(sub):
                if row["active"]:
                    row["active"] = False
                    mark(row, "deactivate", "1B: año/memoria no vigente (dejar General+2025)")
            elif row["active"] and re.search(r"PRESUPUESTOS PARTICIPATIVOS\s+2025\b", sub, re.I):
                url = row["associated_url"]
                row["instruction"] = (
                    f"Aquí tienes la información de los presupuestos participativos de 2025: {url}"
                )
                mark(row, "rewrite_text", "1B: texto ciudadano diferenciado año 2025")
            elif row["active"] and sub == GENERAL_SUB:
                url = row["associated_url"]
                row["instruction"] = (
                    "Puedes consultar todos los presupuestos participativos (índice por años) "
                    f"en este enlace: {url}"
                )
                mark(row, "rewrite_text", "1B: texto ciudadano carpeta general presupuestos")
        elif group == "Videoacta plenos legislatura (actas)":
            if is_videoacta_year_row(sub) and not is_videoacta_keep(sub):
                if row["active"]:
                    row["active"] = False
                    mark(row, "deactivate", "1B: videoacta año no vigente (dejar General+2025)")
            elif row["active"] and re.search(r"Actas y v[ií]deos del pleno de 2025\b", sub, re.I):
                url = row["associated_url"]
                row["instruction"] = (
                    f"Puedes consultar las actas y vídeos del pleno de 2025 en este enlace: {url}"
                )
                mark(row, "rewrite_text", "1B: texto ciudadano videoacta 2025")
            elif row["active"] and sub == GENERAL_SUB:
                url = row["associated_url"]
                row["instruction"] = (
                    "Puedes consultar las actas y vídeos de los plenos (índice por legislatura/año) "
                    f"en este enlace: {url}"
                )
                mark(row, "rewrite_text", "1B: texto ciudadano carpeta general videoactas")


def apply_2b(rows: list[dict]) -> None:
    for row in rows:
        if row["case_subgroup"] != GENERAL_SUB:
            continue
        if row["case_group"] in ANNUAL_KEEP_GROUPS:
            continue
        if row["active"]:
            row["active"] = False
            mark(row, "deactivate", "2B: desactivar General (carpeta principal); se conservan hijos")


def apply_3b(rows: list[dict], by_id: dict[str, dict]) -> None:
    cita_keep = by_id.get(CITA_KEEP_ID)
    cita_drop = by_id.get(CITA_DROP_ID)
    if cita_keep and cita_drop:
        url_a = cita_keep["associated_url"]
        url_b = cita_drop["associated_url"]
        cita_keep["instruction"] = (
            "Puedes pedir cita previa con los servicios municipales de dos formas: "
            f"desde el catálogo de la sede electrónica ({url_a}) "
            f"o directamente para cita presencial ({url_b})."
        )
        cita_keep["associated_url"] = url_a
        cita_keep["response_mode"] = "directo"
        cita_keep["active"] = True
        mark(cita_keep, "merge_keep", "3B: cita previa — catálogo + presencial en una ficha")
        if cita_drop["active"] or True:
            cita_drop["active"] = False
            mark(cita_drop, "merge_drop", f"3B: fusionada en {CITA_KEEP_ID}")

    quejas_keep = by_id.get(QUEJAS_KEEP_ID)
    quejas_drop = by_id.get(QUEJAS_DROP_ID)
    if quejas_keep and quejas_drop:
        url_a = quejas_keep["associated_url"]
        url_b = quejas_drop["associated_url"]
        quejas_keep["instruction"] = (
            "Puedes presentar una queja o sugerencia desde el catálogo de la sede "
            f"({url_a}) o con acceso directo al formulario ({url_b})."
        )
        quejas_keep["associated_url"] = url_a
        quejas_keep["response_mode"] = "directo"
        quejas_keep["active"] = True
        mark(quejas_keep, "merge_keep", "3B: quejas — catálogo + acceso directo en una ficha")
        quejas_drop["active"] = False
        mark(quejas_drop, "merge_drop", f"3B: fusionada en {QUEJAS_KEEP_ID}")


def apply_4(rows: list[dict]) -> None:
    for row in rows:
        mode = row["response_mode"]
        sub = row["case_subgroup"]
        instr = row["instruction"]
        is_norma = sub.startswith("NORMA") or "NORMA ·" in sub
        if mode != "directo":
            continue
        if not (is_norma or has_model_boilerplate(instr)):
            continue
        # Only flip when instruction is model-facing, not a short citizen FAQ
        if not has_model_boilerplate(instr) and not is_norma:
            continue
        if is_norma or has_model_boilerplate(instr):
            row["response_mode"] = "ia"
            if is_norma or sub.startswith("NORMA"):
                row["instruction"] = short_norma_instruction(sub, row["associated_url"])
                if row["associated_url"]:
                    row["allow_url_reading"] = True
            else:
                # Web/TRÁMITE with model-facing prompt: keep as ia with trámite-style text
                row["instruction"] = short_tramite_instruction(sub, row["associated_url"])
                if row["associated_url"] and row.get("allow_url_reading") is False:
                    # preserve existing allow_url_reading if already true; only set when reading needed
                    pass
            mark(row, "mode_to_ia", "4: NORMA/prompt de modelo no debe ir literal al ciudadano")


def apply_5b(rows: list[dict], by_id: dict[str, dict]) -> None:
    for drop_id, note in (
        (ANIMAL_DIRECTO_DROP_ID, "5B: FAQ directo animal; gana TRÁMITE ia"),
        (DEPORTES_DIRECTO_DROP_ID, "5B: reserva directo; gana TRÁMITE Reservae ia"),
        (COMERCIO_DIRECTO_DROP_ID, "5B: FAQ emprendedor directo; gana TRÁMITE ia"),
    ):
        row = by_id.get(drop_id)
        if not row:
            # fallback by subgroup heuristics
            continue
        if row["active"]:
            row["active"] = False
            mark(row, "deactivate", note)

    # Fallbacks if IDs missing: match by subgroup text
    for row in rows:
        if not row["active"]:
            continue
        if row["response_mode"] != "directo":
            continue
        sub = row["case_subgroup"]
        group = row["case_group"]
        if group == "Bienestar Animal" and sub == "Animal perdido o encontrado en la calle":
            row["active"] = False
            mark(row, "deactivate", "5B: FAQ directo animal; gana TRÁMITE ia")
        if group == "Deportes" and sub == "Reservas de instalaciones deportivas online":
            row["active"] = False
            mark(row, "deactivate", "5B: reserva directo; gana TRÁMITE Reservae ia")
        if group == "Comercio" and "emprendedor" in sub.lower() and "TRÁMITE" not in sub:
            # only if looks like FAQ not tramite
            if "Servicios de apoyo" in sub or "Espacio del Emprendedor" in sub:
                # don't auto-drop Espacio del Emprendedor from pagina principal unless ID matched
                pass


def apply_6(rows: list[dict], by_id: dict[str, dict]) -> None:
    impuestos = by_id.get(OVT_IMPUESTOS_ID)
    tasas = by_id.get(OVT_TASAS_ID)
    if impuestos:
        url = impuestos["associated_url"] or "https://alguazas.tributoslocales.es/300070/AALGUAZAS/pagar"
        impuestos["instruction"] = (
            "Para pagar impuestos municipales y recibos (por ejemplo IBI u otros tributos) "
            f"usa la Oficina Virtual Tributaria en este enlace de pago de impuestos: {url}"
        )
        impuestos["active"] = True
        impuestos["response_mode"] = "directo"
        mark(impuestos, "rewrite_text", "6: diferenciar OVT impuestos/recibos")
    if tasas:
        url = tasas["associated_url"] or "https://alguazas.tributoslocales.es/300070/AALGUAZAS/tasas"
        tasas["instruction"] = (
            "Para pagar tasas municipales (distintas de los impuestos/recibos) "
            f"usa este enlace específico de tasas en la Oficina Virtual Tributaria: {url}"
        )
        tasas["active"] = True
        tasas["response_mode"] = "directo"
        mark(tasas, "rewrite_text", "6: diferenciar OVT tasas")


def apply_extras(rows: list[dict]) -> None:
    for row in rows:
        url = row["associated_url"]
        instr = row["instruction"]
        fixed_url = url.replace("alguazas..tributoslocales", "alguazas.tributoslocales")
        fixed_instr = instr.replace("alguazas..tributoslocales", "alguazas.tributoslocales")
        if fixed_url != url or fixed_instr != instr:
            row["associated_url"] = fixed_url
            row["instruction"] = fixed_instr
            mark(row, "fix_url", "Corregido alguazas..tributoslocales")

        # Distinctive rewrite for active ia rows still on generic templates
        if not row["active"] or row["response_mode"] != "ia":
            continue
        sub = row["case_subgroup"]
        if not has_model_boilerplate(row["instruction"]):
            continue
        if sub.startswith("NORMA") or "NORMA ·" in sub:
            row["instruction"] = short_norma_instruction(sub, row["associated_url"])
            if row["associated_url"]:
                row["allow_url_reading"] = True
            mark(row, "rewrite_text", "Plantilla NORMA ia acortada/diferenciada")
        elif sub.startswith("TRÁMITE") or sub.startswith("CONTACTO"):
            row["instruction"] = short_tramite_instruction(sub, row["associated_url"])
            mark(row, "rewrite_text", "Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada")


def write_csv(rows: list[dict]) -> None:
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "id": row["id"],
                    "agent_id": row["agent_id"],
                    "case_group": row["case_group"],
                    "case_subgroup": row["case_subgroup"],
                    "instruction": row["instruction"],
                    "associated_url": row["associated_url"],
                    "allow_url_reading": fmt_bool(row["allow_url_reading"]),
                    "active": fmt_bool(row["active"]),
                    "horas_cache_pagina": row["horas_cache_pagina"],
                    "response_mode": row["response_mode"],
                    "change_action": row["change_action"],
                    "change_note": row["change_note"],
                }
            )


def write_summary(rows: list[dict]) -> None:
    actions = Counter()
    for row in rows:
        for part in (row["change_action"] or "unchanged").split("+"):
            actions[part] += 1

    changed = [r for r in rows if r["change_action"] != "unchanged"]
    active = sum(1 for r in rows if r["active"])
    inactive = len(rows) - active

    # Safety check: no active directo with model boilerplate
    bad_directo = [
        r
        for r in rows
        if r["active"] and r["response_mode"] == "directo" and has_model_boilerplate(r["instruction"])
    ]

    lines = [
        "# Resumen limpieza `agent_instructions`",
        "",
        f"- Filas totales: **{len(rows)}**",
        f"- Activas: **{active}** | Inactivas: **{inactive}**",
        f"- Filas con algún cambio: **{len(changed)}**",
        "",
        "## Decisiones tomadas (grupo)",
        "",
        "| # | Decisión | Qué se acordó | Cómo se aplicó en el CSV |",
        "|---|----------|---------------|--------------------------|",
        "| **1B** | Series anuales | Dejar **General + año vigente (2025)**; quitar el resto de años | Presupuestos participativos y Videoactas: `active=false` en años/memorias antiguas; se mantienen General + 2025 (con texto ciudadano aclarado). Excepción a la 2B solo en estos dos grupos. |",
        "| **2B** | Carpetas General | Quedarse con los **hijos**, no con la carpeta madre | `active=false` en `General (carpeta principal)` del resto de bloques de transparencia (Normativa, Servicios, Subvenciones, Institucional, etc.). |",
        "| **3B** | Cita previa y Quejas | **Una ficha con los dos enlaces** | Fusión `merge_keep` + `merge_drop`: una fila `directo` con catálogo + acceso directo/presencial; la otra desactivada. |",
        "| **4** | NORMAs / prompts de modelo en `directo` | **Excepción:** pasar a `ia` para que el prompt no se envíe literal al ciudadano | `response_mode=ia` en NORMA (y textos con plantilla de modelo) que estaban en `directo`; instruction reescrita para el modelo. |",
        "| **5B** | Solapes FAQ `directo` + TRÁMITE `ia` | Gana el **`ia`** | Desactivados: Animal perdido (`directo`), reservas deportivas (`directo`), FAQ emprendedor (`directo`). |",
        "| **6** | OVT impuestos vs tasas | **Mantener separados** y diferenciar textos | Ambos `active=true` / `directo`; instructions reescritas para no compartir plantilla casi idéntica. |",
        "",
        "Restricción general (salvo la excepción **4**): no cambiar `response_mode` en el resto de fichas. En `directo` el texto llega al ciudadano; en `ia` solo al modelo.",
        "",
        "## Conteos por `change_action` (componentes)",
        "",
    ]
    for action, count in actions.most_common():
        lines.append(f"- `{action}`: {count}")

    lines += ["", "## Cambios destacados", ""]
    for r in sorted(changed, key=lambda x: (x["change_action"], x["case_group"], x["case_subgroup"])):
        lines.append(
            f"- `{r['change_action']}` | {r['case_group']} › {r['case_subgroup']} | "
            f"`{r['id'][:8]}…` | active={r['active']} mode={r['response_mode']} | {r['change_note']}"
        )

    lines += ["", "## Validación", ""]
    if bad_directo:
        lines.append(f"- FALLO: {len(bad_directo)} filas `directo` activas con prompt de modelo:")
        for r in bad_directo:
            lines.append(f"  - {r['id']} | {r['case_subgroup']}")
    else:
        lines.append("- OK: ninguna fila `directo` activa con prompt de modelo.")

    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"No existe {SRC}")

    rows = load_rows()
    by_id = {r["id"]: r for r in rows}

    apply_1b(rows)
    apply_2b(rows)
    apply_3b(rows, by_id)
    apply_4(rows)
    apply_5b(rows, by_id)
    apply_6(rows, by_id)
    apply_extras(rows)

    write_csv(rows)
    write_summary(rows)

    changed = sum(1 for r in rows if r["change_action"] != "unchanged")
    print(f"Leídas: {len(rows)} | Cambiadas: {changed}")
    print(f"CSV: {OUT}")
    print(f"Resumen: {SUMMARY}")


if __name__ == "__main__":
    main()
