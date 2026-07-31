# Segunda etapa: pedidos y WhatsApp

Esta carpeta es una preparación para una etapa futura. El checkout público actual
no llama a este servidor ni guarda datos personales.

El endpoint `POST /api/orders` valida los datos, recalcula importes con el catálogo
del servidor, guarda el pedido y sus productos en D1 con estado
`Pendiente de pago`, y después intenta notificar por WhatsApp.

La notificación automática queda desactivada mientras falte cualquiera de estas
variables: `ADMIN_WHATSAPP_NUMBERS`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN` o `WHATSAPP_TEMPLATE_NAME`.

La plantilla aprobada debe aceptar un parámetro de texto en el cuerpo, donde se
envía el resumen administrativo. Las credenciales reales deben cargarse como
secretos del entorno de publicación y nunca copiarse al JavaScript público.

Antes de publicar:

1. Crear la base D1 y reemplazar `REEMPLAZAR_CON_ID_D1` en `wrangler.jsonc`.
2. Aplicar `server/schema.sql`.
3. Copiar las claves de `.env.example` al entorno seguro del servidor.
4. Crear y aprobar en WhatsApp Manager la plantilla indicada.
5. Configurar `ADMIN_BASE_URL` cuando exista el panel administrativo.

Aunque WhatsApp falle, el pedido permanece guardado y el intento queda registrado
en `notification_logs`.

## Alcance previsto para la segunda etapa

- Registrar clientes y relacionarlos con sus pedidos.
- Estados: `pendiente`, `pago_confirmado`, `preparando`, `enviado`,
  `entregado` y `cancelado`.
- Guardar solamente el identificador de pago entregado por Mercado Pago.
- Guardar códigos de seguimiento y registrar confirmaciones por correo.
- Incorporar exportación desde un panel privado.
- Proteger todas las rutas administrativas mediante autenticación y autorización.
- Mantener secretos y credenciales exclusivamente en variables del servidor.

El panel y las rutas administrativas no se publican en esta etapa para evitar
exponer información personal sin autenticación.
