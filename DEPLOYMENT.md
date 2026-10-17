# Despliegue a producción (Supabase nuevo + Vercel + Stripe)

Checklist completa para poner DetailFlow en producción sobre un proyecto de
Supabase nuevo. Sigue los pasos en orden.

## 0. Verificación local

```bash
npm ci
npm run typecheck && npm run lint && npm test && npm run test:db && npm run build
```

`npm run test:db` aplica todas las migraciones a un Postgres en memoria y
comprueba los permisos (que un usuario no pueda cambiarse el plan, marcar
cotizaciones como pagadas, ver datos de otro negocio, etc.).

## 1. Supabase: base de datos

Con la CLI (recomendado, registra qué migraciones se aplicaron):

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

`<PROJECT_REF>` es el identificador de la URL `https://<PROJECT_REF>.supabase.co`.
`db push` pide la contraseña de la base de datos del proyecto.

Comprobación: en *Table Editor* deben existir `businesses`, `business_members`,
`services`, `customers`, `leads`, `quotes`, `subscriptions`, `business_metrics`,
`trial_claims`, `auth_verification_intents`, `quote_public_access`,
`stripe_events`, `security_rate_limits`, `audit_logs`; y en *Storage* el bucket
privado `vehicle-photos`.

## 2. Supabase: autenticación

*Authentication → URL Configuration*
- **Site URL**: `https://<tu-dominio>` (p. ej. `https://detailflow-two.vercel.app`)
- **Redirect URLs**: `https://<tu-dominio>/**`

*Authentication → Sign In / Providers → Email*
- Email provider: activado. **Confirm email: activado** (el registro espera la verificación).
- Longitud mínima de contraseña: 8.

*Authentication → Emails → SMTP Settings* → **Enable custom SMTP**
(**obligatorio en producción**). Sin SMTP propio, Supabase solo entrega correos
a los miembros del equipo del proyecto ("Email address not authorized" para el
resto) y con un límite muy bajo por hora. Todos los correos de la app
(verificación, recuperar contraseña, invitaciones de equipo) los envía Supabase
Auth por este SMTP; la app no usa ningún otro proveedor de correo.

Ejemplos de SMTP:
- **Gmail / Google Workspace**: host `smtp.gmail.com`, puerto `465`, usuario =
  tu dirección, contraseña = una *contraseña de aplicación* (requiere verificación
  en dos pasos). Límite de Gmail: ~500 correos/día.
- **Brevo** (plan gratuito, 300/día): host `smtp-relay.brevo.com`, puerto `587`,
  usuario y clave SMTP desde *Brevo → SMTP & API*.

Después sube el límite en *Authentication → Rate Limits → emails per hour*
(p. ej. 100).

Los avisos de "nuevo lead" no se envían por correo: los negocios ven los leads
en el panel.

## 3. Supabase: claves

*Project Settings → API Keys*
- Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Secret key → `SUPABASE_SECRET_KEY` (solo servidor; nunca en el navegador)
- URL del proyecto → `NEXT_PUBLIC_SUPABASE_URL`

## 4. Stripe (modo live)

1. Productos: crea los precios mensuales **Pro** y **Business** → `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`.
2. Activa **Connect** (cuentas Express) para que los negocios cobren a sus clientes.
3. Activa el **Customer portal** (*Settings → Billing → Customer portal*).
4. Webhooks (*Developers → Webhooks*), URL `https://<tu-dominio>/api/stripe/webhook`:
   - Endpoint **"Your account"** → secreto en `STRIPE_WEBHOOK_SECRET`. Eventos:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
     `charge.refunded`, `charge.dispute.created`.
   - Endpoint **"Connected accounts"** → secreto en `STRIPE_CONNECT_WEBHOOK_SECRET`. Evento: `account.updated`.

## 5. Vercel: variables de entorno (Production)

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase nuevo |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key |
| `NEXT_PUBLIC_APP_URL` | `https://<tu-dominio>` (sin `/` final) |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (endpoint de la cuenta) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_...` (endpoint de Connect) |
| `STRIPE_PRO_PRICE_ID` / `STRIPE_BUSINESS_PRICE_ID` | `price_...` |
| `STRIPE_APPLICATION_FEE_PERCENT` | p. ej. `2.5` |
| `AI_API_KEY` | clave de NVIDIA NIM (o compatible OpenAI) |
| `AI_BASE_URL` / `AI_MODEL` | opcionales; por defecto NVIDIA |
| `NEXT_PUBLIC_CONTACT_EMAIL` / `NEXT_PUBLIC_CONTACT_ADDRESS` | páginas legales/contacto |
| `TRIAL_RISK_SECRET` | cadena aleatoria larga (`openssl rand -hex 32`) |
| `CRON_SECRET` | cadena aleatoria larga; Vercel la envía al cron diario |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | CAPTCHA de Cloudflare (recomendado) |
| `BUSINESS_AI_MONTHLY_HARD_CAP` | p. ej. `5000` |

Elimina las variables antiguas `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` si apuntaban al Supabase anterior: la app las usa
como respaldo cuando falta una clave nueva, y con el proyecto viejo fallarían
de forma confusa.

`TRIAL_RISK_SECRET` no debe cambiar después del lanzamiento (invalida las
sesiones de verificación en curso y el historial antiabuso de pruebas).

Tras guardar las variables: **Redeploy** de la rama de producción.

## 6. Prueba de humo en producción

1. Registro → llega el correo → al verificar, la pestaña original entra sola a `/onboarding`.
2. Crear el negocio y el primer servicio → el panel muestra "14-day trial".
3. Abrir `https://<tu-dominio>/<slug>/lead` en incógnito y enviar una solicitud con foto.
4. El lead aparece en el panel; crear cotización, aceptarla y compartir el enlace.
5. *Settings → Connect Stripe* completa el onboarding de Stripe Express.
6. Pagar la cotización desde el enlace público → queda en `paid` (vía webhook).
7. *Settings* → elegir plan Pro → Checkout → el plan cambia (vía webhook).
8. Stripe → Webhooks: todas las entregas con respuesta 200.
