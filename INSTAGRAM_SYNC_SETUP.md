# Sincronización de Instagram

## Arquitectura activa

La tienda publicada en GitHub Pages no consulta Meta desde el navegador. El flujo es:

1. GitHub Actions ejecuta `.github/workflows/sync-instagram.yml` cada tres horas o manualmente.
2. `scripts/sync-instagram.mjs` consulta la API Graph usando secretos de GitHub.
3. Las imágenes se descargan a `assets/images/instagram/feed/` para evitar que venzan las URLs temporales de Meta.
4. Se actualizan `data/instagram-feed.json` y `data/instagram-sync-status.json` de forma atómica.
5. El panel lee esos archivos. Si Meta falla, conserva el último feed válido y muestra el estado real sin romper la página.
6. Al abrir el panel, los productos de Firestore importados previamente con una URL temporal se reparan con la imagen local estable, sin reemplazar imágenes manuales válidas.

Firebase sigue siendo la base de datos de productos. Firebase Storage continúa usándose para fotografías cargadas manualmente. Esta integración no usa Supabase.

## Elegir un solo modo de autenticación

### Opción A: token de Página de Facebook (flujo actual)

Repository secrets necesarios:

- `FACEBOOK_PAGE_ACCESS_TOKEN`: token de la Página con acceso a la cuenta profesional de Instagram.
- `INSTAGRAM_USER_ID`: identificador numérico de la cuenta profesional.
- `META_APP_ID`: ID de la aplicación de Meta; permite verificar el estado y vencimiento del token.
- `META_APP_SECRET`: secreto de la aplicación; marcar como secreto y nunca publicarlo.

Repository variables:

- `INSTAGRAM_USERNAME`: `arvel.customsy2k`, sin `@`.
- `META_GRAPH_VERSION`: opcional; actualmente `v26.0`.
- `INSTAGRAM_SYNC_LIMIT`: opcional; de 1 a 100, por defecto 50.

Los tokens de Página no se renuevan con `ig_refresh_token`. Para una operación estable, generá el token con un usuario del sistema del portfolio empresarial y mantené la Página y la cuenta de Instagram asignadas a ese usuario. El workflow valida el token con Meta y avisa antes de su vencimiento cuando Meta informa una fecha.

### Opción B: Instagram Login

Usar solamente si se abandona el token de Página. Eliminá `FACEBOOK_PAGE_ACCESS_TOKEN` para que este modo sea seleccionado.

Repository secrets:

- `INSTAGRAM_ACCESS_TOKEN`: token de larga duración.
- `INSTAGRAM_USER_ID`: identificador numérico de Instagram.
- `INSTAGRAM_SECRET_UPDATE_TOKEN`: opcional. Token de GitHub limitado a este repositorio y con permiso para administrar Actions secrets. Permite que el workflow guarde el token renovado.

El script llama a `refresh_access_token`. Si Meta entrega un token nuevo, el workflow lo vuelve a guardar como `INSTAGRAM_ACCESS_TOKEN`. Sin `INSTAGRAM_SECRET_UPDATE_TOKEN`, la consulta funcionará durante esa ejecución, pero el token renovado no podrá persistirse.

No configures los dos modos simultáneamente. Si existen ambos tokens, se prioriza el token de Página para mantener compatibilidad con la integración actual.

## Puesta en marcha

1. En GitHub abrí **Settings → Secrets and variables → Actions**.
2. Cargá los secrets y variables del modo elegido.
3. Abrí **Actions → Sincronizar Instagram → Run workflow**.
4. Verificá que se actualicen el feed, el estado y la carpeta de imágenes.
5. Abrí el panel de productos una vez para reparar productos antiguos que todavía tengan URLs temporales de Meta.

Los códigos 401, 403, token revocado y permisos faltantes quedan registrados como una reconexión requerida. Los límites de uso, timeouts y errores 5xx se reintentan y conservan el contenido anterior.
