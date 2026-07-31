# Supabase para Arvel Customs

## Resultado de la auditoría local

El proyecto recibido solamente incluía la URL de la Edge Function:

`https://uwhnxaaivjreeyheuarw.supabase.co/functions/v1/create-order`

No incluía conexión al proyecto remoto, migraciones, definición de tablas,
políticas RLS, bucket de imágenes ni una Publishable/Anon key. Por esa razón no
fue posible leer el esquema remoto desde este entorno.

Para comprobar el estado real antes de aplicar cambios, ejecutá primero
`supabase/audit-current-schema.sql` en Supabase SQL Editor. Es una consulta de
solo lectura. Luego revisá y ejecutá
`supabase/migrations/20260730_product_admin.sql`.

## Dónde colocar la URL y la clave pública

El único archivo de configuración público es:

`js/supabase-config.js`

La URL del proyecto ya está colocada. Reemplazá:

`PEGA_AQUI_TU_PUBLISHABLE_O_ANON_KEY`

por la **Publishable key** (`sb_publishable_...`) o la clave legacy **anon**.
Ambas son claves públicas aptas para el navegador cuando RLS está habilitado.

Nunca coloques en ese archivo una Secret key, `service_role`, contraseña de base
de datos ni token personal.

## Activación

1. Ejecutá la consulta de auditoría.
2. Revisá y ejecutá la migración.
3. En Storage creá un bucket público llamado exactamente `product-images`,
   con límite de 10 MB y tipos permitidos JPG, PNG, WebP y AVIF. La migración
   crea las políticas de escritura, pero no modifica directamente el esquema
   interno de Storage.
4. En Authentication > Users, creá la cuenta administradora.
5. Ejecutá esta instrucción reemplazando el correo:

```sql
insert into public.admin_profiles (user_id, is_admin)
select id, true
from auth.users
where email = 'TU_EMAIL_ADMIN'
on conflict (user_id) do update set is_admin = true;
```

6. Pegá la clave pública en `js/supabase-config.js`.
7. Abrí `admin.html` desde un servidor web. Supabase Auth no debe probarse
   abriendo el archivo con `file://`.

## Modelo creado

- `products`: contenido general y estado `draft`, `published` o `hidden`.
- `product_variants`: UUID estable por combinación de talle y color.
- `product_images`: orden, ruta de Storage y URL pública.
- `admin_profiles`: lista explícita de usuarios autorizados.
- Bucket público `product-images`: lectura pública; escritura y borrado solo
  para administradoras.

El catálogo consulta exclusivamente productos con estado `published`. Las
políticas RLS repiten esa restricción en la base de datos.

## Edge Function

El checkout invoca `create-order` mediante `supabase.functions.invoke` y envía:

```json
{
  "items": [
    {
      "variant_id": "UUID-DE-LA-VARIANTE",
      "quantity": 1
    }
  ]
}
```

La función debe recalcular precios y stock desde la base de datos y nunca
confiar en importes enviados por el navegador. También debe responder con un
número de pedido en alguno de estos campos:

- `order_number`
- `orderNumber`
- `order.order_number`
- `order.orderNumber`

Si la función falla, el checkout conserva el carrito y avisa que el pedido no
fue recibido.
