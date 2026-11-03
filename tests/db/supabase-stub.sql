-- LOCAL TEST ONLY: minimal stand-ins for what Supabase provides (roles, auth schema, auth.uid()).
-- Never run against a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
-- Same contract as Supabase: the JWT "sub" claim of the current request.
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to public;
-- Supabase's default privileges give API roles table access in public; migrations revoke what they don't want.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select, update on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
