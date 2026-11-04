-- Načti.me – databáze pro vlastní Supabase projekt (nic společného s hrou).
-- Spustí se jednou po založení projektu Načti.me.

-- ---------- Profily a předplatné ----------
create table if not exists public.nacti_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  sub_status text,                      -- active / trialing / past_due / canceled …
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.nacti_profiles enable row level security;
create policy "vlastni profil" on public.nacti_profiles for select using (auth.uid() = user_id);

create or replace function public.nacti_is_pro(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nacti_profiles p
    where p.user_id = uid
      and p.sub_status in ('active', 'trialing', 'past_due')
      and (p.current_period_end is null or p.current_period_end > now() - interval '3 days')
  );
$$;

-- ---------- Dynamické kódy ----------
create table if not exists public.nacti_codes (
  id text primary key check (id ~ '^[A-Za-z0-9]{7}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target text not null check (target ~* '^https?://' and char_length(target) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nacti_codes_user_idx on public.nacti_codes (user_id, created_at desc);
alter table public.nacti_codes enable row level security;
create policy "cist vlastni kody" on public.nacti_codes for select using (auth.uid() = user_id);
create policy "pro tvori kody" on public.nacti_codes for insert with check (auth.uid() = user_id and public.nacti_is_pro(auth.uid()));
create policy "pro upravuje kody" on public.nacti_codes for update using (auth.uid() = user_id and public.nacti_is_pro(auth.uid())) with check (auth.uid() = user_id);
create policy "mazat vlastni kody" on public.nacti_codes for delete using (auth.uid() = user_id);

-- ---------- Naskenování ----------
create table if not exists public.nacti_scans (
  id bigserial primary key,
  code_id text not null references public.nacti_codes (id) on delete cascade,
  at timestamptz not null default now(),
  device text,
  country text
);
create index if not exists nacti_scans_code_at_idx on public.nacti_scans (code_id, at desc);
alter table public.nacti_scans enable row level security;
create policy "cist skeny vlastnich kodu" on public.nacti_scans for select using (
  exists (select 1 from public.nacti_codes c where c.id = nacti_scans.code_id and c.user_id = auth.uid())
);

-- ---------- Limit AI pro verzi zdarma ----------
create table if not exists public.nacti_ai_usage (
  ip text not null, day date not null default current_date, count integer not null default 0,
  primary key (ip, day)
);
alter table public.nacti_ai_usage enable row level security;
create or replace function public.nacti_ai_hit(p_ip text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  insert into public.nacti_ai_usage (ip, day, count) values (p_ip, current_date, 1)
  on conflict (ip, day) do update set count = public.nacti_ai_usage.count + 1
  returning count into c;
  return c <= p_limit;
end $$;
revoke execute on function public.nacti_ai_hit(text, integer) from public, anon, authenticated;

-- ---------- Fotky ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nacti-fotky', 'nacti-fotky', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
create policy "nacti_fotky_upload" on storage.objects for insert to anon, authenticated
with check (bucket_id = 'nacti-fotky' and name ~ '^[A-Za-z0-9]{12}\.jpg$');
