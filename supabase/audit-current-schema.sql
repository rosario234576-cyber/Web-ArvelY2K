-- Consulta de solo lectura para auditar el proyecto remoto antes de aplicar la migración.

select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema in ('public', 'storage')
  and table_name in (
    'products',
    'product_variants',
    'product_images',
    'admin_profiles',
    'buckets',
    'objects'
  )
order by table_schema, table_name, ordinal_position;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
  and tablename in (
    'products',
    'product_variants',
    'product_images',
    'admin_profiles',
    'objects'
  )
order by schemaname, tablename, policyname;

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'product-images';

