# -*- coding: utf-8 -*-
import csv
rows = list(csv.DictReader(open("data/agent_instructions_unificado.csv", encoding="utf-8-sig")))
print("total", len(rows))
print("all ia", all(r["response_mode"] == "ia" for r in rows))
print("\nKEY ROWS:")
keys = (
    "Ayuntamiento (",
    "Policía Local (móvil",
    "Ecoparque Municipal y recogida",
    "Horario y estado del Ecoparque",
    "OMIC",
    "Redes del ayuntamiento",
    "Pleno ordinario",
    "Animal encontrado",
    "He perdido mi perro",
    "Garantía Juvenil",
    "Salas y aulas",
    "Reservas deportivas",
    "Censar mi perro",
    "Oficina de Recaudación",
    "Agencia de Desarrollo",
    "Pabellón",
    "Descargar APP",
)
for r in rows:
    s = r["case_subgroup"]
    if any(k in s for k in keys):
        print(f"- [{r['active']}] {s}")

print("\nSHOULD BE ABSENT:")
bad = [
    "Teléfono Ayuntamiento",
    "Teléfono Policía Local",
    "Teléfono Recaudación",
    "Teléfono recogida de enseres",
    "Compartir en Facebook",
    "APP municipal Alguazas Conect@",
    "Animal abandonado",
    "Perro perdido",
    "Garantía Juvenil (SEPE)",
    "Plenos municipales (YouTube)",
]
subs = [r["case_subgroup"] for r in rows]
for b in bad:
    hits = [s for s in subs if s == b or s.endswith(" · " + b)]
    print(f"  {b}: {'FOUND '+str(hits) if hits else 'ok absent'}")
