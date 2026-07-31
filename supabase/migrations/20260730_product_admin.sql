-- Arvel Customs: catálogo administrable
-- Ejecutar desde Supabase SQL Editor antes de habilitar el panel.

create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sku text not null unique,
  category text not null,
  collection text not null default '',
  price integer not null default 0 check (price >= 0),
  short_description text not null default '',
  description text not null default '',
  material text not null default '',
  care text not null default '',
  measurements jsonb not null default '{}'::jsonb,
  sizes text[] not null default '{}'::text[],
  colors text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  condition text not null default 'Custom',
  featured boolean not null default false,
  unique_piece boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'hidden')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  color text not null,
  stock integer not null default 0 check (stock >= 0),
  sku text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size, color)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, storage_path)
);

-- Compatibilidad si alguna de estas tablas ya existía con menos columnas.
alter table public.products add column if not exists collection text not null default '';
alter table public.products add column if not exists short_description text not null default '';
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists material text not null default '';
alter table public.products add column if not exists care text not null default '';
alter table public.products add column if not exists measurements jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists sizes text[] not null default '{}'::text[];
alter table public.products add column if not exists colors text[] not null default '{}'::text[];
alter table public.products add column if not exists tags text[] not null default '{}'::text[];
alter table public.products add column if not exists condition text not null default 'Custom';
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists unique_piece boolean not null default false;
alter table public.products add column if not exists status text not null default 'draft';
alter table public.products add column if not exists created_by uuid references auth.users(id);
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

create index if not exists products_status_created_at_idx
  on public.products(status, created_at desc);
create index if not exists product_variants_product_id_idx
  on public.product_variants(product_id);
create index if not exists product_images_product_id_sort_idx
  on public.product_images(product_id, sort_order);

create or replace function public.is_arvel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = (select auth.uid())
      and is_admin = true
  );
$$;

revoke all on function public.is_arvel_admin() from public;
grant execute on function public.is_arvel_admin() to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

alter table public.admin_profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;

drop policy if exists "Admins read own profile" on public.admin_profiles;
create policy "Admins read own profile"
on public.admin_profiles for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Published products are public" on public.products;
create policy "Published products are public"
on public.products for select to anon, authenticated
using (status = 'published' or public.is_arvel_admin());

drop policy if exists "Admins create products" on public.products;
create policy "Admins create products"
on public.products for insert to authenticated
with check (public.is_arvel_admin());

drop policy if exists "Admins update products" on public.products;
create policy "Admins update products"
on public.products for update to authenticated
using (public.is_arvel_admin())
with check (public.is_arvel_admin());

drop policy if exists "Admins delete products" on public.products;
create policy "Admins delete products"
on public.products for delete to authenticated
using (public.is_arvel_admin());

drop policy if exists "Published variants are public" on public.product_variants;
create policy "Published variants are public"
on public.product_variants for select to anon, authenticated
using (
  public.is_arvel_admin()
  or exists (
    select 1 from public.products
    where products.id = product_variants.product_id
      and products.status = 'published'
  )
);

drop policy if exists "Admins manage variants" on public.product_variants;
create policy "Admins manage variants"
on public.product_variants for all to authenticated
using (public.is_arvel_admin())
with check (public.is_arvel_admin());

drop policy if exists "Published images are public" on public.product_images;
create policy "Published images are public"
on public.product_images for select to anon, authenticated
using (
  public.is_arvel_admin()
  or exists (
    select 1 from public.products
    where products.id = product_images.product_id
      and products.status = 'published'
  )
);

drop policy if exists "Admins manage image rows" on public.product_images;
create policy "Admins manage image rows"
on public.product_images for all to authenticated
using (public.is_arvel_admin())
with check (public.is_arvel_admin());

grant select on public.products, public.product_variants, public.product_images to anon;
grant select, insert, update, delete
  on public.products, public.product_variants, public.product_images
  to authenticated;
grant select on public.admin_profiles to authenticated;

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_arvel_admin()
);

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.is_arvel_admin()
)
with check (
  bucket_id = 'product-images'
  and public.is_arvel_admin()
);

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.is_arvel_admin()
);

-- Después de crear el usuario en Authentication > Users, habilitarlo una vez:
-- insert into public.admin_profiles (user_id, is_admin)
-- select id, true from auth.users where email = 'TU_EMAIL_ADMIN'
-- on conflict (user_id) do update set is_admin = true;
