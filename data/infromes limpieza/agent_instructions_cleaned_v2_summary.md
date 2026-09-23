# Resumen limpieza v2 `agent_instructions`

- Filas totales: **371**
- Activas: **308** | Inactivas: **63**
- Filas tocadas en v2: **33**

## Decisiones v2 aplicadas

| # | Decisión | Aplicación |
|---|----------|------------|
| 1 | Ayuntamiento vacío | Relleno dirección+tel+email |
| 2 | Cine/teatro prompt en directo | FAQ ciudadana |
| 3 | Plenos videoacta | FAQ + sin descargas chat |
| 4 | Presupuestos Participación | mode_to_ia |
| 5 | Informajoven ×2 | merge |
| 6 | Seguridad ×2 | deactivate genérica |
| 7 | Cita médica | keep directo, drop ia |
| 8 | Alguazas en cifras | keep directo, drop ia |
| 9 | FACe ×3 | merge en Sede (URL Alguazas) |
| 10 | Cita previa ×3 | sin cambios |
| 11 | Typo 20206 | corregido a 2026 |
| 12 | FAQ en ia | mode_to_directo |
| 13 | URL alguazas.es/ | vaciar en 4 FAQ |
| 14 | Emprendedor ×5 | sin cambios |
| 15 | OVT domiciliaciones | merge |
| 16 | Salas estudio | merge ia |
| 17 | YouTube + plenos ordinarios | merge |

## Conteos change_action (filas tocadas v2)

- `mode_to_directo`: 10
- `merge_drop`: 6
- `merge_keep`: 5
- `fix_url`: 4
- `rewrite_text`: 4
- `deactivate`: 3
- `mode_to_ia`: 1

## Validación rápida

- Directo activos con instruction vacío: **0**
- Directo activos con marcadores de prompt: **0**

## Cambios v2 destacados

- `rewrite_text` | Atención ciudadana › Ayuntamiento (general): dirección, teléfono, email, horario de atenció | `ba9cac7f…` | active=True mode=directo | v2 P1: rellenar Ayuntamiento (dirección+tel+email) desde directorio/coworking
- `mode_to_directo` | Bienestar Animal › CONTACTO · Dirección General de Derechos de los Animales | `812f65cb…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Bienestar Animal › TRÁMITE · Animal encontrado o abandonado (no es el mío) | `6fcd8668…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Bienestar Animal › TRÁMITE · Animales sueltos en la calle | `4f2c2c44…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Bienestar Animal › TRÁMITE · Clínicas veterinarias | `aabf94f9…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Bienestar Animal › TRÁMITE · He perdido mi perro o mi animal | `bad0e1ce…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Bienestar Animal › TRÁMITE · Obligaciones tenencia de animales | `90963a1c…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `fix_url` | Comercio › Oficina Municipal de Información al Consumidor (OMIC) | `70deb63d…` | active=True mode=directo | v2 P13: quitar associated_url genérica alguazas.es/
- `mode_to_directo` | Comercio › TRÁMITE · Coste licencia de apertura | `fc8a40a1…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Comercio › TRÁMITE · Montar empresa o negocio | `7fcdc9d7…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Comercio › TRÁMITE · Negocio Plaza de Abastos | `30d74f13…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `mode_to_directo` | Comercio › TRÁMITE · Puesto mercado semanal | `416a2240…` | active=True mode=directo | v2 P12: instruction FAQ ciudadana -> directo
- `rewrite_text` | Corporación Municipal › Plenos municipales (vídeos y actas) | `a47f448f…` | active=True mode=directo | v2 P3: FAQ directo videoacta + sin descargas desde el chat
- `merge_keep` | Corporación Municipal › Plenos ordinarios del Ayuntamiento (fecha y canal YouTube) | `7699768f…` | active=True mode=directo | v2 P17: fusionar plenos ordinarios + canal YouTube
- `rewrite_text` | Cultura y Turismo › Entradas de cine y teatro | `ce1f294d…` | active=True mode=directo | v2 P2: restaurar FAQ ciudadana cine/teatro (quitar prompt de modelo)
- `merge_keep` | Educación › TRÁMITE · Salas y aulas de estudio (información y formulario) | `0242dba7…` | active=True mode=ia | v2 P16: fusionar info salas + solicitud formulario en un ia
- `merge_drop` | Educación › TRÁMITE · Salas y aulas de estudio (información) | `125e5030…` | active=False mode=ia | v2 P16: fusionada en 0242dba7-ff2d-4942-b9bd-1e30374161e4
- `merge_drop` | Gestión tributaria › OVT - Solicitar domiciliación | `c6ed2da7…` | active=False mode=directo | v2 P15: fusionada en 53b7e574-eda8-4ec0-8a67-500d910d2af4
- `merge_keep` | Gestión tributaria › OVT - Solicitar, consultar o modificar domiciliación | `53b7e574…` | active=True mode=directo | v2 P15: fusionar solicitar+consultar/modificar domiciliación
- `merge_drop` | Hacienda › Facturación electrónica a proveedores (FACe) | `f861b435…` | active=False mode=directo | v2 P9: fusionada en Sede FACE
- `merge_drop+v1:rewrite_text` | Hacienda › TRÁMITE · Factura electrónica (FACe) | `3fc64351…` | active=False mode=ia | v2 P9: fusionada en Sede FACE
- `merge_keep` | Juventud › Informajoven - Servicio de Información Juvenil | `733c9d67…` | active=True mode=directo | v2 P5: fusionar Informajoven (servicio+portal+teléfono)
- `merge_drop` | Juventud › Informajoven - portal de información juvenil | `eae92024…` | active=False mode=directo | v2 P5: fusionada en 733c9d67-57b1-43b9-978a-577ba118e37d
- `fix_url` | Obras y Servicios › Horario del Cementerio Municipal | `6671d90b…` | active=True mode=directo | v2 P13: quitar associated_url genérica alguazas.es/
- `fix_url` | Obras y Servicios › Solares y parcelas con maleza (denuncia y limpieza) | `e9c90c24…` | active=True mode=directo | v2 P13: quitar associated_url genérica alguazas.es/
- `fix_url` | Obras y Servicios › Tasa de reserva de aparcamiento en vado | `17a6feed…` | active=True mode=directo | v2 P13: quitar associated_url genérica alguazas.es/
- `mode_to_ia` | Participación Ciudadana › Presupuestos participativos | `23cb9f13…` | active=True mode=ia | v2 P4: prompt de modelo en directo -> ia (keep allow_url_reading)
- `deactivate+v1:mode_to_ia` | Participación Ciudadana › TRÁMITE · Alguazas en cifras | `4f4a2cbb…` | active=False mode=ia | v2 P8: gana directo Transparencia CREM; drop TRÁMITE ia Participación
- `merge_drop` | Página principal › Canal de YouTube del Ayuntamiento de Alguazas | `25060f10…` | active=False mode=directo | v2 P17: fusionada en 7699768f-413a-4d2e-9ed2-bcec75a14af3
- `deactivate+v1:rewrite_text` | Salud Pública › TRÁMITE · Cita médica (SMS Murcia) | `0ae92f25…` | active=False mode=ia | v2 P7: gana directo Cita médica online; drop TRÁMITE ia
- `merge_keep` | Sede electrónica › Sede - FACE facturas electrónicas | `6df67293…` | active=True mode=directo | v2 P9: fusionar FACe Hacienda+ia+Sede; URL directorio Alguazas
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA MUNICIPAL REGULADORA DE LOS VEHÍCULOS DE MOVILIDAD P | `ffe21623…` | active=True mode=ia | v2 P11: corregir typo 20206 -> 2026
- `deactivate` | Seguridad Ciudadana › Seguridad ciudadana | `e986c25d…` | active=False mode=directo | v2 P6: genérica Seguridad ciudadana; gana Denuncia o incidencia
