# Resumen limpieza `agent_instructions`

- Filas totales: **371**
- Activas: **317** | Inactivas: **54**
- Filas con algún cambio: **123**

## Decisiones tomadas (grupo)

| # | Decisión | Qué se acordó | Cómo se aplicó en el CSV |
|---|----------|---------------|--------------------------|
| **1B** | Series anuales | Dejar **General + año vigente (2025)**; quitar el resto de años | Presupuestos participativos y Videoactas: `active=false` en años/memorias antiguas; se mantienen General + 2025 (con texto ciudadano aclarado). Excepción a la 2B solo en estos dos grupos. |
| **2B** | Carpetas General | Quedarse con los **hijos**, no con la carpeta madre | `active=false` en `General (carpeta principal)` del resto de bloques de transparencia (Normativa, Servicios, Subvenciones, Institucional, etc.). |
| **3B** | Cita previa y Quejas | **Una ficha con los dos enlaces** | Fusión `merge_keep` + `merge_drop`: una fila `directo` con catálogo + acceso directo/presencial; la otra desactivada. |
| **4** | NORMAs / prompts de modelo en `directo` | **Excepción:** pasar a `ia` para que el prompt no se envíe literal al ciudadano | `response_mode=ia` en NORMA (y textos con plantilla de modelo) que estaban en `directo`; instruction reescrita para el modelo. |
| **5B** | Solapes FAQ `directo` + TRÁMITE `ia` | Gana el **`ia`** | Desactivados: Animal perdido (`directo`), reservas deportivas (`directo`), FAQ emprendedor (`directo`). |
| **6** | OVT impuestos vs tasas | **Mantener separados** y diferenciar textos | Ambos `active=true` / `directo`; instructions reescritas para no compartir plantilla casi idéntica. |

Restricción general (salvo la excepción **4**): no cambiar `response_mode` en el resto de fichas. En `directo` el texto llega al ciudadano; en `ia` solo al modelo.

## Conteos por `change_action` (componentes)

- `unchanged`: 248
- `rewrite_text`: 87
- `deactivate`: 24
- `mode_to_ia`: 13
- `merge_keep`: 2
- `merge_drop`: 2
- `fix_url`: 1

## Cambios destacados

- `deactivate` | Bienestar Animal › Animal perdido o encontrado en la calle | `bfce1375…` | active=False mode=directo | 5B: FAQ directo animal; gana TRÁMITE ia
- `deactivate` | Comercio › Servicios de apoyo a emprendedores y autónomos (plan de empresa local financiación) | `38acd91f…` | active=False mode=directo | 5B: FAQ emprendedor directo; gana TRÁMITE ia
- `deactivate` | Contratación › General (carpeta principal) | `9f43ddaf…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Deportes › Reservas de instalaciones deportivas online | `8d307170…` | active=False mode=directo | 5B: reserva directo; gana TRÁMITE Reservae ia
- `deactivate` | Económica › General (carpeta principal) | `94547c7c…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Empleo público › General (carpeta principal) | `db14baae…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Información relacionada con la transparencia › General (carpeta principal) | `b10f3ce1…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Institucional › General (carpeta principal) | `688b4476…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Normativa › General (carpeta principal) | `030ecdfb…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Patrimonio › General (carpeta principal) | `e74d1427…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Presupuestos participativos › MEMORIA PRESUPUESTOS PARTICIPATIVOS 2024 | `37f5feae…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2017 | `4479dcbb…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2018 | `3911d481…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2019 | `50dca143…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2020 | `7194287b…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2021 | `e0818cfd…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2022 | `8cae4cac…` | active=False mode=directo | 1B: año/memoria no vigente (dejar General+2025)
- `deactivate` | Protección de datos › General (carpeta principal) | `6e704a7b…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Servicios › General (carpeta principal) | `526f355e…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Subvenciones, convenios, concursos, certamenes y ayudas › General (carpeta principal) | `6095851e…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | UNION EUROPEA › General (carpeta principal) | `5523a853…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Urbanismo, obras públicas y medio ambiente › General (carpeta principal) | `a0729bf5…` | active=False mode=directo | 2B: desactivar General (carpeta principal); se conservan hijos
- `deactivate` | Videoacta plenos legislatura (actas) › Actas y vídeos del pleno de 2023 | `aeac1928…` | active=False mode=directo | 1B: videoacta año no vigente (dejar General+2025)
- `deactivate` | Videoacta plenos legislatura (actas) › Actas y vídeos del pleno de 2024 | `a941fb35…` | active=False mode=directo | 1B: videoacta año no vigente (dejar General+2025)
- `fix_url+rewrite_text` | Hacienda › TRÁMITE · Pago de tributos | `021cec4f…` | active=True mode=ia | Corregido alguazas..tributoslocales; Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `merge_drop` | Sede electrónica › Sede - Cita previa presencial | `9a462110…` | active=False mode=directo | 3B: fusionada en 64035854-6535-41dd-a44a-f967d42be357
- `merge_drop` | Sede electrónica › Sede - Quejas y sugerencias (acceso directo) | `dd367885…` | active=False mode=directo | 3B: fusionada en f6c39fb0-7f5c-4c87-88a1-1be6ca4e7259
- `merge_keep` | Sede electrónica › Información y atención ciudadana - Cita previa | `64035854…` | active=True mode=directo | 3B: cita previa — catálogo + presencial en una ficha
- `merge_keep` | Sede electrónica › Información y atención ciudadana - Quejas y sugerencias | `f6c39fb0…` | active=True mode=directo | 3B: quejas — catálogo + acceso directo en una ficha
- `mode_to_ia` | Corporación Municipal › Equipo de gobierno y concejales | `ccb566bc…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › Alguazas Participa (qué es y cómo participar) | `de7d9619…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › Consultas públicas | `88aa380f…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › Normativa de participación ciudadana | `7c33db30…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › Propuestas ciudadanas (activas y anteriores) | `5191c98b…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › TRÁMITE · Alguazas en cifras | `4f4a2cbb…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › TRÁMITE · Portal de Participación | `71c7ab58…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia` | Participación Ciudadana › Te Escuchamos (incidencias, quejas y sugerencias) | `4c434bc3…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano
- `mode_to_ia+rewrite_text` | Corporación Municipal › NORMA · REGLAMENTO ORGANICO Y FUNCIONAL DEL AYUNTAMIENTO DE ALGUAZAS | `60124e53…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano; Plantilla NORMA ia acortada/diferenciada
- `mode_to_ia+rewrite_text` | Cultura y Turismo › NORMA · PRECIOS PÚBLICOS DE ACTIVIDADES DE CULTURA E IGUALDAD PARA 2022 | `8220a15d…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano; Plantilla NORMA ia acortada/diferenciada
- `mode_to_ia+rewrite_text` | Participación Ciudadana › NORMA · MODIFICACIÓN ART. 37 DEL REGLAMENTO MUNICIPAL DE PARTICIPACIÓN CIUDADANA Y BUEN GOBIERNO | `8cb153ea…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano; Plantilla NORMA ia acortada/diferenciada
- `mode_to_ia+rewrite_text` | Participación Ciudadana › NORMA · REGLAMENTO MUNICIPAL DE PRESUPUESTOS PARTICIPATIVOS (BORM Nº 128 DE 05-06-2025) | `7960e1be…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano; Plantilla NORMA ia acortada/diferenciada
- `mode_to_ia+rewrite_text` | Participación Ciudadana › NORMA · REGLAMENTO MUNICIPAL PARTICIPACION CIUDADANA Y BUEN GOBIERNO | `d0dd5baa…` | active=True mode=ia | 4: NORMA/prompt de modelo no debe ir literal al ciudadano; Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Bienestar Animal › NORMA · ORDENANZA FISCAL REGULADORA DE LA TASA POR REGISTRO, CAPTURA, ESTANCIA Y OBSERVACIÓN DE ANIMALES POR EL SERVICIO DE RECOGIDA DE ALGUAZAS (BORM nº 233 de 07/10/2022) | `f47129b7…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Bienestar Animal › NORMA · ORDENANZA MUNICIPAL REGULADORA SOBRE PROTECCIÓN Y TENENCIA DE ANIMALES DE COMPAÑIA EN EL MUNICIPIO DE ALGUAZAS | `50472cfc…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Bienestar Animal › TRÁMITE · Instalaciones caninas | `9f48131d…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Bienestar Animal › TRÁMITE · Protectora local ANERPA | `678131c4…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Bienestar Animal › TRÁMITE · Voluntarios colonias felinas | `6f887ffc…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › NORMA · ORDENANZA FISCAL REGULADORA DE LA OCUPACIÓN DE LA VÍA PÚBLICA CON TERRAZAS Y OTRAS INSTALACIONES | `538f9038…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Comercio › NORMA · ORDENANZA FISCAL REGULADORA DE LA TASA POR LA PRESTACIÓN DEL SERVICIO DE MERCADO DE ABASTOS | `971098d2…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Comercio › NORMA · ORDENANZA FISCAL REGULADORA DE LA TASA POR OCUPACIÓN DE LA VÍA PÚBLICA POR PUESTOS, BARRACAS, CASETAS DE VENTA, O ATRACCIONES SITUADOS EN TERRENO DE USO PÚBLICO E INDUSTRIAS CALLEJERAS Y AMBULANTES, MERCADILLO SEMANAL Y RESERVA DE ESPACIO | `6e6b1b6b…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Comercio › NORMA · ORDENANZA MUNICIPAL REGULADORA DE LA VENTA AMBULANTE O NO SEDENTARIA EN ALGUAZAS (BORM nº 122 de 29/05/2023) | `a2f6365e…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Comercio › NORMA · ORDENANZA REGULADORA DE LA ADJUDICACION DEL PUESTO DE VENTA EN LA LONJA MUNICIPAL Y LA ACTIVIDAD EN ELLOS DESARROLLADA | `ad9fba77…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Agencia de Desarrollo Local de Alguazas (información y gestiones) | `a789bff4…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Ayudas y servicios del SEF a autónomos | `73088740…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Ayudas y subvenciones (INFO Murcia) | `7f5a0a2c…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Comercios locales (ACE Alguazas) | `0c47390f…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Crea tu plan de empresa | `b92d79b6…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Instituto de Fomento de la Región de Murcia | `1afe2391…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · ODEPA | `48a0769c…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Portal IPYME | `e59b1d03…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Punto de Atención al Emprendedor | `1807b7f2…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Comercio › TRÁMITE · Servicios a empresas del SEF | `0e53e86a…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Deportes › NORMA · PRECIO PÚBLICO PARA LA UTILIZACIÓN DE INSTALACIONES DEPORTIVAS Y LA REALIZACIÓN DE ACTIVIDADES DEPORTIVAS (BORM nº 42 de 20/02/2024) | `443ec97a…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Educación › NORMA · MODIFICACIÓN DE LA ORDENANZA REGULADORA DEL PRECIO PÚBLICO DEL SERVICIO DE ASISTENCIA, ESTANCIA Y COMEDOR DE ESCUELAS INFANTILES (BORM nº 19 de 24/01/2026) | `1ad52877…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Educación › NORMA · ORDENANZA REGULADORA DEL PRECIO PÚBLICO DEL SERVICIO DE ASISTENCIA, ESTANCIA Y COMEDOR DE ESCUELAS INFANTILES | `67704702…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Educación › NORMA · PRECIOS PÚBLICOS DEL SERVICIO DE AULA MATINAL «MADRUGADORES» | `b557d7df…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Empleo y Formación › NORMA · BASES GENERALES DE LOS PROCESOS DE ESTABILIZACIÓN DEL EMPLEO TEMPORAL | `1132206c…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Empleo y Formación › NORMA · OFERTA DE EMPLEO PÚBLICO AÑO 2020 | `22f04edc…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Empleo y Formación › NORMA · OFERTA DE EMPLEO PÚBLICO AÑO 2021 | `079964cd…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Empleo y Formación › NORMA · OFERTA DE EMPLEO PÚBLICO PARA LA ESTABILIZACIÓN DEL EMPLEO TEMPORAL EN EL AYUNTAMIENTO DE ALGUAZAS (RD 14/2021) | `16684256…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Empleo y Formación › TRÁMITE · Oficina del Emprendedor | `e87d3b46…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Gestión tributaria › OVT - Pagar impuestos | `1d317d7c…` | active=True mode=directo | 6: diferenciar OVT impuestos/recibos
- `rewrite_text` | Gestión tributaria › OVT - Pagar tasas | `a7c42b0f…` | active=True mode=directo | 6: diferenciar OVT tasas
- `rewrite_text` | Hacienda › NORMA · ORDENANZA MUNICIPAL GENERAL DE SUBVENCIONES | `c28625fa…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Hacienda › NORMA · PLAN DE DISPOSICIÓN DE FONDOS DE TESORERÍA DEL AYUNTAMIENTO DE ALGUAZAS | `8536d721…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Hacienda › NORMA · PLAN ESTRATÉGICO DE SUBVENCIONES DEL AYUNTAMIENTO DE ALGUAZAS 2024 | `1d513b10…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Hacienda › NORMA · REGLAMENTO DE BASES REGULADORAS DE CONCESION DE SUBVENCIONES A ENTIDADES Y ASOCIACIONES SIN ÁNIMO DE LUCRO | `4393e35b…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Hacienda › TRÁMITE · Calendario fiscal | `8024bec4…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Hacienda › TRÁMITE · Factura electrónica (FACe) | `3fc64351…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Hacienda › TRÁMITE · Oficina municipal de recaudación (gestiones) | `467c8120…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Igualdad › NORMA · II PLAN MUNICIPAL DE IGUALDAD DE OPORTUNIDADES ENTRE HOMBRES Y MUJERES DEL AYUNTAMIENTO DE ALGUAZAS (Decreto de Alcaldía 1284/2024) | `cae5bdf5…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Juventud › NORMA · PLAN DE LA JUVENTUD DE ALGUAZAS 2021-2030 | `8f125df7…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Juventud › NORMA · PRECIOS PÚBLICOS DE ACTIVIDADES JUVENILES | `0bfb8a03…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Juventud › TRÁMITE · InformaJoven | `d7977d69…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Juventud › TRÁMITE · Inscripción en Garantía Juvenil (SEPE) | `d7315e69…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Juventud › TRÁMITE · MundoJoven | `14f5ff1a…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Juventud › TRÁMITE · Solicitar beca educación | `122e1252…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Juventud › TRÁMITE · Web Juventud Alguazas | `561ca8a4…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Mayores › NORMA · MODIFICACIÓN PRECIO PÚBLICO PARA LA REALIZACIÓN DE ACTIVIDADES DEPORTIVAS – GERONTOGIMNASIA (BORM Nº 99 DE 02-05-2025) | `b9d0b9ed…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · ORDENANZA FISCAL REGULADORA DE LA TASA POR AUTORIZACIÓN DE PASO Y CONCESIÓN DE LOS VADOS EN EL MUNICIPIO DE ALGUAZAS (BORM nº 198 de 27/08/2022) | `e553c2dd…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · ORDENANZA FISCAL REGULADORA DE LIMPIEZA VIARIA Y GESTIÓN DE RESIDUOS MUNICIPALES DE ALGUAZAS (BORM nº 155 de 05/07/2024) | `36fe039a…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · ORDENANZA MUNICIPAL REGULADORA DE LA LIMPIEZA Y VALLADO DE SOLARES Y PARCELAS EN SUELO URBANO, URBANIZABLE Y RÚSTICO EN EL MUNICIPIO DE ALGUAZAS. | `b4b1071a…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · ORDENANZA REGULADORA DE LA PRESTACIÓN PATRIMONIAL DE CARÁCTER NO TRIBUTARIO POR LA PRESTACIÓN DEL SERVICIO DE ABASTECIMIENTO DE AGUA POTABLE, SANEAMIENTO Y ACTIVIDADES CONEXAS (BORM Nº274 de 26/11/2025) | `4e77ce8d…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · ORDENANZA REGULADORA DE VERTIDOS A LA RED DE ALCANTARILLADO | `ae696b48…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · REGLAMENTO DEL SERVICIO MUNICIPAL DE ABASTECIMIENTO DE AGUAS DE ALGUAZAS | `6bbb868e…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Obras y Servicios › NORMA · REGLAMENTO REGULADOR DEL SERVICIO DEL CEMENTERIO MUNICIPAL DE ALGUAZAS | `ea0005ee…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Presupuestos participativos › General (carpeta principal) | `2b2c2dbd…` | active=True mode=directo | 1B: texto ciudadano carpeta general presupuestos
- `rewrite_text` | Presupuestos participativos › PRESUPUESTOS PARTICIPATIVOS 2025 | `a334efe6…` | active=True mode=directo | 1B: texto ciudadano diferenciado año 2025
- `rewrite_text` | Salud Pública › NORMA · ORDENANZA MUNICIPAL REGULADORA DE PROTECCIÓN DEL MEDIO AMBIENTE CONTRA LA EMISIÓN DE RUIDOS Y VIBRACIONES EN ALGUAZAS. | `9e6a5661…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Salud Pública › TRÁMITE · Cita médica (SMS Murcia) | `0ae92f25…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA FISCAL REGULADORA DE LA TASA POR LA RETIRADA DE VEHÍCULOS DE LA VÍA PÚBLICA, SU TRASLADO Y CUSTODIA EN EL DEPÓSITO MUNICIPAL (BORM Nº 198 DE 27/08/2022) | `7b19bb47…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA MUNICIPAL DE CIRCULACION | `41227d29…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA MUNICIPAL PARA PROTECCION DE LA SEGURIDAD CIUDADANA Y PREVENCION DE CONDUCTAS INCIVICAS EN EL MUNICIPIO DE ALGUAZAS | `42bed151…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA MUNICIPAL REGULADORA DE LA ACTUACIÓN MUNICIPAL EN RELACIÓN CON LA VENTA, DISPESACIÓN Y SUMINISTRO DE BEBIDAS ALCOHÓLICAS, ASÍ COMO SU CONSUMO EN ESPACIOS Y VÍAS PÚBLICAS | `5dc2da7f…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA MUNICIPAL REGULADORA DE LA RETIRADA DE VEHICULOS DE LA VIA PUBLICA | `959bab11…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · ORDENANZA MUNICIPAL REGULADORA DE LOS VEHÍCULOS DE MOVILIDAD PERSONAL, PATINETES, MONOPATINES Y SIMILARES EN ALGUAZAS (BORM nº 180 de 06/08/20206) | `ffe21623…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Seguridad Ciudadana › NORMA · REGLAMENTO DEL VOLUNTARIADO DE PROTECCIÓN CIVIL DEL MUNICIPIO DE ALGUAZAS | `5dd11029…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Servicios Sociales › NORMA · ORDENANZA REGULADORA DE LA EXPEDICIÓN DE LA TARJETA DE ESTACIONAMIENTO DE VEHÍCULOS DE PERSONAS CON DISCAPACIDAD | `89f81aad…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Servicios Sociales › NORMA · ORDENANZA REGULADORA DEL PRECIO PÚBLICO POR EL SERVICIO DE AYUDA A DOMICILIO | `7584b896…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Servicios Sociales › NORMA · REGLAMENTO DE AYUDAS DE URGENTE NECESIDAD | `c6ef42cd…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Servicios Sociales › TRÁMITE · Ingreso Mínimo Vital | `c1315172…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Transparencia › NORMA · ACUERDO MARCO SOBRE CONDICIONES DE TRABAJO DEL AYUNTAMIENTO DE ALGUAZAS | `0d67fa58…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Transparencia › NORMA · CONVENIO COLECTIVO DEL PERSONAL LABORAL DEL EXCELENTÍSIMO AYUNTAMIENTO DE ALGUAZAS PARA EL AÑO 2009 | `57b3953e…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Transparencia › NORMA · NORMAS REGULADORAS TELETRABAJO DEL PERSONAL DEL AYUNTAMIENTO | `0ce6d7b7…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Transparencia › NORMA · ORDENANZA REGULADORA DE LA OBLIGATORIEDAD DE RELACIÓN POR MEDIOS ELECTRÓNICOS DE LAS PERSONAS ASPIRANTES EN LOS PROCESOS DE SELECCIÓN DE PERSONAL (Aprobación inicial en BORM nº 180 de 06/08/2026) | `8b523211…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Urbanismo › NORMA · NORMAS SUBSIDIARIAS | `ec881bb7…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Urbanismo › NORMA · ORDENANZA FISCAL REGULADORA DE LA TASA POR PRESTACION DE SERVICIOS URBANISTICAS DE PLANEAMIENTO Y GESTION | `03df44c4…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Urbanismo › NORMA · ORDENANZA REGULADORA DE LA TASA POR LICENCIAS URBANÍSTICAS | `235fa6db…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Urbanismo › NORMA · ORDENANZA REGULADORA DE PUBLICIDAD EXTERIOR | `7569dbdd…` | active=True mode=ia | Plantilla NORMA ia acortada/diferenciada
- `rewrite_text` | Urbanismo › TRÁMITE · Ayudas a la vivienda (CARM) | `1759679e…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Urbanismo › TRÁMITE · PGMOU (planeamiento urbanístico Murcia) | `25aa34f8…` | active=True mode=ia | Plantilla TRÁMITE/CONTACTO ia acortada/diferenciada
- `rewrite_text` | Videoacta plenos legislatura (actas) › Actas y vídeos del pleno de 2025 | `25ad32b8…` | active=True mode=directo | 1B: texto ciudadano videoacta 2025
- `rewrite_text` | Videoacta plenos legislatura (actas) › General (carpeta principal) | `fa48dc08…` | active=True mode=directo | 1B: texto ciudadano carpeta general videoactas

## Validación

- OK: ninguna fila `directo` activa con prompt de modelo.
