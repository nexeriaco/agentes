# Informe: medidas de seguridad del chatbot municipal

Fecha: 2026-09-18  
Rama: `railway-experimentos`

## Hecho en esta oleada (código)

| Medida | Detalle | Dónde |
|--------|---------|--------|
| URLs B′ | Solo `associated_url` / `url` con `allow_url_reading` del turno | `src/services/urlGuard.js`, `answer.js` |
| URLs B″ | PDF/enlace del **mismo hostname** que una URL B′ | `urlGuard.js` |
| URLs C (SSRF) | DNS + bloqueo IPs privadas/metadata; redirects manuales revalidados | `urlGuard.js`, `urlTool.js` |
| Límite longitud | Máx. **300** caracteres (aviso, sin Claude) | `messageHandler.js` |
| Separación user/system | Mensaje ciudadano solo en rol `user` (sin cambio de diseño) | `answer.js` |
| Contacto escalación | Fuera del system prompt; solo en `buildHandoffMessage` | `answer.js`, `messageHandler.js` |
| Rate limit chat | 20 mensajes / 5 min por chat | `chatRateLimit.js` |
| Excepciones rate | `/start` no cuenta; duplicado idéntico &lt; 2 s → silencio | `messageHandler.js`, `chatRateLimit.js` |
| Paralelismo | Hasta **10** mensajes Telegram a la vez | `poller.js` |
| Timeout Claude | **60 s** por llamada Anthropic | `anthropic/client.js` |
| Express body | `express.json({ limit: '100kb' })` | `index.js` |
| Helmet | Cabeceras HTTP de seguridad | `index.js` (+ dep. `helmet`) |

## Hecho fuera de código (operación)

| Medida | Estado |
|--------|--------|
| Borrado historial a **31 días** (Supabase Cron) | Creado por el equipo (`purge-conversation-history-31d`) |

## Omitido a propósito (esta oleada)

| Medida | Motivo |
|--------|--------|
| Firma webhook WhatsApp + App Secret | WhatsApp aún no operativo |
| Rate limit por IP en `/whatsapp/webhook` | Depende de WhatsApp activo |
| Redacción / cese de logs con texto completo | Decisión: no se espera PII en mensajes |
| Revisión clave Supabase / RLS | Omitido por ahora |
| Escalación humana real (ticket/aviso) | Placeholder de mensaje se mantiene |
| Webhook Telegram + `secret_token` | Se sigue con polling |

## Pendiente / siguiente oleada

1. **WhatsApp:** validar `X-Hub-Signature-256`, `WHATSAPP_APP_SECRET`, rate limit HTTP en el webhook, y el handler de respuestas.
2. **Operación:** `npm install` en el entorno de deploy para instalar `helmet` (añadido en `package.json`).
3. Opcional más adelante: RLS en Supabase, handoff con notificación real, webhook Telegram, golden set de acierto.

## Cómo probar rápido (Telegram)

1. Mensaje &gt; 300 caracteres → aviso de longitud.
2. 21 mensajes en &lt; 5 min (mismo chat) → aviso de rate limit.
3. Dos chats a la vez → ambos responden sin esperar en serie (hasta 10).
4. Consulta normal con URL legible → sigue funcionando.
5. `/health` → `{ "status": "ok" }` con cabeceras Helmet.
