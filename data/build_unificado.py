# -*- coding: utf-8 -*-
"""Build unified agent_instructions CSV from data/ sources with merges."""
import csv
from pathlib import Path

DATA = Path("data")
OUT = DATA / "agent_instructions_unificado.csv"
AGENT = "c1330a20-c057-4764-8121-6268ca02f280"
FIELDS = [
    "agent_id",
    "case_group",
    "case_subgroup",
    "instruction",
    "associated_url",
    "allow_url_reading",
    "active",
    "horas_cache_pagina",
    "response_mode",
]


def load(name):
    with open(DATA / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def row(
    case_group,
    case_subgroup,
    instruction,
    associated_url="",
    allow_url_reading=False,
    active=True,
    horas_cache_pagina="",
):
    return {
        "agent_id": AGENT,
        "case_group": case_group,
        "case_subgroup": case_subgroup,
        "instruction": instruction.strip(),
        "associated_url": associated_url or "",
        "allow_url_reading": "True" if allow_url_reading in (True, "True", "TRUE", "true") else "False",
        "active": "True" if active in (True, "True", "TRUE", "true") else "False",
        "horas_cache_pagina": horas_cache_pagina or "",
        "response_mode": "ia",
    }


def truthy(v):
    return str(v).strip().lower() in ("true", "1", "yes")


dir_rows = load("pagina_principal_directorio.csv")
conc_rows = load("concejalias.csv")
ord_rows = load("ordenanzas.csv")

# Index directorio by 1-based line number as in prior analysis
D = {i + 1: r for i, r in enumerate(dir_rows)}

# ---- Directorio rows to DROP (consumed by merges or discarded) ----
drop_dir = {
    1,   # A1 -> into ayuntamiento
    2,   # A4 -> ecoparque contacto
    3,   # A2 -> policia
    4,   # A3 keep 34 only
    6,   # A6
    9,   # A8 keep 16 / B2
    10,  # A7 keep 20
    14,  # B1 -> animal encontrado/abandonado
    16,  # A8/B2 pleno unificado
    19,  # A5
    21, 22, 23, 24,  # A9 redes
    25,  # A1
    27,  # A5
    28,  # A6
    31,  # A2
    33,  # A4
    44,  # B3 CONTACTO Agencia creado a mano
}

# Concejalías subgroups to DROP (merged/replaced)
drop_conc_subgroups = {
    "Animal abandonado",  # B1
    "Perro perdido",  # replaced with matizado
    "Plenos municipales (vídeos y actas)",  # B2 into pleno unificado
    "Garantía Juvenil",
    "Garantía Juvenil (SEPE)",
    "Inscripción en Garantía Juvenil (SEPE)",
    "Aulas de estudio",
    "Salas de estudio",
    "Solicitud uso aula de estudio",
    "Actividades deportivas (Reservae)",
    "Mis reservas (Reservae)",
    "Reserva de instalaciones deportivas",
    "Inscripción censo canino",
    "Qué necesito para censar mi perro",
    # Tipado replacements:
    "Agencia de Desarrollo Local de Alguazas",
    "Oficina municipal de recaudación",
    "Pago de tributos",
    "Calendario fiscal",
}

out_dir = []
out_conc = []
out_ord = []


def add_dir(r):
    out_dir.append(r)


def add_conc(r):
    out_conc.append(r)


def add_ord(r):
    out_ord.append(r)


# ========== MERGED / NEW ROWS ==========

# A1 Ayuntamiento
add_dir(
    row(
        "Atención ciudadana",
        "CONTACTO · Ayuntamiento (dirección, teléfono, email, horario)",
        "Puedes contactar con el Ayuntamiento de Alguazas llamando al 968 620 022, "
        "escribiendo al correo electrónico atencionalciudadano@alguazas.es, "
        "o pasándote por Plaza Don Enrique Tierno Galván, 1. "
        "Atendemos de lunes a viernes de 8:30 a 14:30h.",
        associated_url="tel:+34968620022",
    )
)

# A2 Policía Local móvil + fijo
add_dir(
    row(
        "Seguridad Ciudadana",
        "CONTACTO · Policía Local (móvil y fijo)",
        "Puedes contactar con la Policía Local en el teléfono móvil 629 706 497 "
        "o en el fijo 968 620 987 (seguridad, emergencias no graves, multas, denuncias).",
        associated_url="tel:+34629706497",
    )
)

# A4 Ecoparque contacto (2+33)
add_dir(
    row(
        "Obras y Servicios",
        "CONTACTO · Ecoparque Municipal y recogida de enseres",
        "El teléfono del Ecoparque Municipal y de la recogida de enseres es el 654 009 879 "
        "(reciclaje, punto limpio, residuos, escombros, recogida a domicilio).",
        associated_url="tel:+34654009879",
    )
)

# A5 OMIC
add_dir(
    row(
        "Comercio",
        "CONTACTO · OMIC Oficina del Consumidor (horario y cita)",
        "El Ayuntamiento presta el servicio de la OMIC (información al consumidor y reclamaciones de consumo). "
        "Atienden los martes de 9:00 a 14:00h en la planta baja del Ayuntamiento. "
        "Para pedir cita llama al 654 009 877.",
    )
)

# A6 Seguridad denuncia
add_dir(
    row(
        "Seguridad Ciudadana",
        "TRÁMITE · Denuncia o incidencia de seguridad ciudadana",
        "Puedes notificar una denuncia o incidencia de seguridad ciudadana en este enlace: "
        "https://alguazas.es/incidencias-seguridad/",
        associated_url="https://alguazas.es/incidencias-seguridad/",
    )
)

# A8 + B2 Plenos unificado
add_dir(
    row(
        "Corporación Municipal",
        "TRÁMITE · Pleno ordinario (cuándo, YouTube y actas)",
        "Los plenos ordinarios se celebran el último miércoles de cada mes (excepto agosto) a las 20:00h. "
        "Puedes verlos presencialmente en el salón de plenos del Ayuntamiento o en directo por YouTube: "
        "https://www.youtube.com/@ayuntamientoalguazas7195 "
        "(también https://youtube.com/channel/UCQ4yDrgQqCl_1kNTK3Zuc2A). "
        "Para consultar vídeos y actas de plenos en la plataforma municipal: https://videoacta.alguazas.es/. "
        "No ofrezcas descargas directas de vídeo o PDF al ciudadano; indícale siempre la plataforma o el canal.",
        associated_url="https://videoacta.alguazas.es/",
    )
)

# A9 Redes
add_dir(
    row(
        "Página principal",
        "CONTACTO · Redes del ayuntamiento (Facebook, X, WhatsApp, LinkedIn)",
        "Puedes compartir o consultar la página del Ayuntamiento de Alguazas en redes: "
        "Facebook https://www.facebook.com/sharer.php?u=https://alguazas.es/ ; "
        "X (Twitter) https://twitter.com/share?text=Ayuntamiento%20de%20Alguazas&url=https://alguazas.es/ ; "
        "WhatsApp https://api.whatsapp.com/send?text=https://alguazas.es/ ; "
        "LinkedIn https://linkedin.com/shareArticle?mini=true&title=Ayuntamiento%20de%20Alguazas&url=https://alguazas.es/ .",
        associated_url="https://alguazas.es/",
    )
)

# B1 Animal encontrado/abandonado (dir #14 + concejalías Animal abandonado)
add_conc(
    row(
        "Bienestar Animal",
        "TRÁMITE · Animal encontrado o abandonado (no es el mío)",
        "Si has encontrado un animal abandonado o suelto que no es tuyo: hazle fotos, anota la localización "
        "y las características, y llama inmediatamente a la Policía Local "
        "(móvil 629 706 497 o fijo 968 620 987). Ellos se encargan del resto.",
        associated_url="https://alguazas.es/concejalia-de-bienestar-animal/",
    )
)

# B1 Perro perdido matizado (he perdido el mío)
add_conc(
    row(
        "Bienestar Animal",
        "TRÁMITE · He perdido mi perro o mi animal",
        "Si has perdido TU animal (es tuyo y se te ha escapado o no lo encuentras): acude a Policía Local "
        "y deja constancia de la pérdida, facilitando fotografía si es posible "
        "(móvil 629 706 497 o fijo 968 620 987). "
        "La concejalía y la protectora Anerpa se encargarán de publicar el aviso para localizarlo. "
        "Si en cambio has encontrado un animal que no es tuyo, usa el procedimiento de animal encontrado o abandonado.",
        associated_url="https://alguazas.es/concejalia-de-bienestar-animal/",
    )
)

# B3 Tipar Agencia
add_dir(
    row(
        "Empleo y Formación",
        "CONTACTO · Agencia de Desarrollo Local (teléfono)",
        "El teléfono de la Agencia de Desarrollo Local es el 654 009 902 "
        "(empleo, formación, orientación laboral, empresas).",
    )
)
# Keep concejalías ADL as TRÁMITE with tipado - get original instruction
adl = next(r for r in conc_rows if r["case_subgroup"] == "Agencia de Desarrollo Local de Alguazas")
add_conc(
    row(
        "Comercio",
        "TRÁMITE · Agencia de Desarrollo Local de Alguazas (información y gestiones)",
        adl["instruction"],
        associated_url=adl["associated_url"].replace("blogspot..com", "blogspot.com"),
        allow_url_reading=truthy(adl["allow_url_reading"]),
        active=truthy(adl["active"]),
        horas_cache_pagina=adl.get("horas_cache_pagina") or "",
    )
)

# B4 Tipar recaudación concejalías
for old_name, new_sub in [
    ("Oficina municipal de recaudación", "TRÁMITE · Oficina municipal de recaudación (gestiones)"),
    ("Pago de tributos", "TRÁMITE · Pago de tributos"),
    ("Calendario fiscal", "TRÁMITE · Calendario fiscal"),
]:
    src = next(r for r in conc_rows if r["case_subgroup"] == old_name)
    add_conc(
        row(
            src["case_group"],
            new_sub,
            src["instruction"],
            associated_url=src["associated_url"],
            allow_url_reading=truthy(src["allow_url_reading"]),
            active=truthy(src["active"]),
            horas_cache_pagina=src.get("horas_cache_pagina") or "",
        )
    )

# C Garantía Juvenil: municipal + inscripción SEPE
gj = next(r for r in conc_rows if r["case_subgroup"] == "Garantía Juvenil")
gj_ins = next(r for r in conc_rows if r["case_subgroup"] == "Inscripción en Garantía Juvenil (SEPE)")
add_conc(
    row(
        "Juventud",
        "TRÁMITE · Garantía Juvenil (información municipal)",
        gj["instruction"],
        associated_url=gj["associated_url"],
        allow_url_reading=truthy(gj["allow_url_reading"]),
        active=truthy(gj["active"]),
        horas_cache_pagina=gj.get("horas_cache_pagina") or "",
    )
)
add_conc(
    row(
        "Juventud",
        "TRÁMITE · Inscripción en Garantía Juvenil (SEPE)",
        "Para inscribirte en Garantía Juvenil (SEPE) consulta e inicia el trámite en este enlace oficial: "
        "https://www.sepe.es/HomeSepe/Personas/encontrar-trabajo/Garantia-Juvenil.html . "
        "También hay información general del SEPE en: "
        "https://www.sepe.es/HomeSepe/encontrar-trabajo/Garantia-Juvenil . "
        + gj_ins["instruction"],
        associated_url="https://www.sepe.es/HomeSepe/Personas/encontrar-trabajo/Garantia-Juvenil.html",
        allow_url_reading=True,
    )
)

# C Aulas/salas: una info + una solicitud formulario
add_conc(
    row(
        "Educación",
        "TRÁMITE · Salas y aulas de estudio (información)",
        "Toda la información sobre salas y aulas de estudio está en https://alguazas.es/salas-de-estudio/ . "
        "Accede y consulta el contenido para responder; termina indicando ese enlace.",
        associated_url="https://alguazas.es/salas-de-estudio/",
        allow_url_reading=True,
    )
)
sol_aula = next(r for r in conc_rows if r["case_subgroup"] == "Solicitud uso aula de estudio")
add_conc(
    row(
        "Educación",
        "TRÁMITE · Solicitud uso de aula de estudio (formulario)",
        sol_aula["instruction"],
        associated_url=sol_aula["associated_url"],
        allow_url_reading=truthy(sol_aula["allow_url_reading"]),
        active=truthy(sol_aula["active"]),
        horas_cache_pagina=sol_aula.get("horas_cache_pagina") or "",
    )
)

# C Reservas deporte: una fila con los 3 enlaces
add_conc(
    row(
        "Deportes",
        "TRÁMITE · Reservas deportivas Reservae (actividades, instalaciones y mis reservas)",
        "Para gestiones deportivas en Reservae usa el enlace que corresponda, copiado tal cual: "
        "reservar o ver actividades https://alguazas.reservae.es/actividades/ ; "
        "reserva de instalaciones http://alguazas.reservae.es/ ; "
        "consultar mis reservas https://alguazas.reservae.es/mireserva . "
        "No hace falta leer la página para responder: comparte el enlace adecuado a lo que pida el ciudadano.",
        associated_url="http://alguazas.reservae.es/",
        allow_url_reading=False,
    )
)

# C Censo canino fusionado
censo = next(r for r in conc_rows if r["case_subgroup"] == "Inscripción censo canino")
add_conc(
    row(
        "Bienestar Animal",
        "TRÁMITE · Censar mi perro (requisitos e inscripción)",
        "Para censar tu perro necesitas presentar una fotocopia de tu DNI como propietario y la cartilla "
        "sanitaria del animal, junto al modelo de solicitud. No hay que pagar tasas por la inscripción. "
        "El formulario se publica en https://alguazas.es/concejalia-de-bienestar-animal/ : "
        "localiza el enlace exacto de descarga en esa página (cópialo carácter a carácter; no lo inventes). "
        "Si no tienes el enlace exacto, usa la página general. "
        + censo["instruction"],
        associated_url="https://alguazas.es/concejalia-de-bienestar-animal/",
        allow_url_reading=True,
    )
)

# ========== REMAINING DIRECTORIO ==========
for i, r in enumerate(dir_rows, start=1):
    if i in drop_dir:
        continue
    sub = r["case_subgroup"]
    # Tipar contactos de teléfono restantes
    if "teléfono, contacto" in sub.lower() or sub.lower().startswith("teléfono"):
        if not sub.startswith("CONTACTO ·"):
            sub = f"CONTACTO · {sub}"
    # Tipar recaudación #34
    if i == 34:
        sub = "CONTACTO · Oficina de Recaudación (impuestos, tributos, tasas, pagos, IBI)"
    # Tipar app iOS #20
    if i == 20:
        sub = "TRÁMITE · Descargar APP Ayuntamiento (iOS)"
    # Tipar horario ecoparque #12
    if i == 12:
        sub = "TRÁMITE · Horario y estado del Ecoparque"
    add_dir(
        row(
            r["case_group"],
            sub,
            r["instruction"],
            associated_url=r.get("associated_url") or "",
            allow_url_reading=truthy(r.get("allow_url_reading")),
            active=truthy(r.get("active")),
            horas_cache_pagina=r.get("horas_cache_pagina") or "",
        )
    )

# ========== REMAINING CONCEJALIAS ==========
for r in conc_rows:
    if r["case_subgroup"] in drop_conc_subgroups:
        continue
    sub = r["case_subgroup"]
    # Tipado ligero: si parece trámite web y no tiene prefijo
    if not sub.startswith(("CONTACTO ·", "TRÁMITE ·", "NORMA ·")):
        if truthy(r.get("allow_url_reading")) or "solicitud" in sub.lower() or "inscripción" in sub.lower():
            sub = f"TRÁMITE · {sub}"
        elif any(k in sub.lower() for k in ("teléfono", "contacto", "dirección")):
            sub = f"CONTACTO · {sub}"
        else:
            # default trámite informativo for concejalías content
            sub = f"TRÁMITE · {sub}"
    add_conc(
        row(
            r["case_group"],
            sub,
            r["instruction"],
            associated_url=r.get("associated_url") or "",
            allow_url_reading=truthy(r.get("allow_url_reading")),
            active=truthy(r.get("active")),
            horas_cache_pagina=r.get("horas_cache_pagina") or "",
        )
    )

# ========== ORDENANZAS (tipar NORMA ·) ==========
for r in ord_rows:
    sub = r["case_subgroup"]
    if not sub.startswith("NORMA ·"):
        sub = f"NORMA · {sub}"
    add_ord(
        row(
            r["case_group"],
            sub,
            r["instruction"],
            associated_url=r.get("associated_url") or "",
            allow_url_reading=truthy(r.get("allow_url_reading")),
            active=truthy(r.get("active")),
            horas_cache_pagina=r.get("horas_cache_pagina") or "",
        )
    )

out = out_dir + out_conc + out_ord

# Force all response_mode ia (already in row())
assert all(x["response_mode"] == "ia" for x in out)


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(rows)


ORIGINAL = DATA / "original"
write_csv(ORIGINAL / "pagina_principal_directorio.csv", out_dir)
write_csv(ORIGINAL / "concejalias.csv", out_conc)
write_csv(ORIGINAL / "ordenanzas.csv", out_ord)
write_csv(OUT, out)

# Stats
from collections import Counter

print(f"Wrote {ORIGINAL / 'pagina_principal_directorio.csv'} ({len(out_dir)} rows)")
print(f"Wrote {ORIGINAL / 'concejalias.csv'} ({len(out_conc)} rows)")
print(f"Wrote {ORIGINAL / 'ordenanzas.csv'} ({len(out_ord)} rows)")
print(f"Wrote {OUT} with {len(out)} rows")
print("active:", Counter(x["active"] for x in out))
print("allow_url_reading:", Counter(x["allow_url_reading"] for x in out))
print("response_mode:", Counter(x["response_mode"] for x in out))
print("prefixes:", Counter(x["case_subgroup"].split(" · ")[0] for x in out if " · " in x["case_subgroup"]))
