-- ============================================================
-- 001_init.sql — schéma initial (games, mistakes, repertoire_nodes)
-- ============================================================
-- Note de conception : le schéma fourni dans la spec ne comportait pas de
-- colonne d'appartenance. Comme l'app est distribuée publiquement sur l'App
-- Store, la clé anon est publique : sans `user_id` + RLS, n'importe qui
-- pourrait lire/écrire les données. On ajoute donc `user_id` partout, avec un
-- trigger qui le remplit automatiquement pour que les insertions externes
-- (scénario Make, script d'analyse) n'aient pas à s'en soucier.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Propriétaire unique de l'instance
-- ------------------------------------------------------------
-- Une seule ligne. Sert de valeur de repli pour `user_id` quand l'insertion
-- vient d'un contexte sans session utilisateur (service role : Make, cron).
create table if not exists app_owner (
  id boolean primary key default true check (id),
  user_id uuid not null references auth.users(id) on delete cascade
);

create or replace function resolve_owner_id() returns uuid
language sql stable as $$
  select coalesce(auth.uid(), (select user_id from app_owner limit 1));
$$;

create or replace function set_user_id() returns trigger
language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := resolve_owner_id();
  end if;
  if new.user_id is null then
    raise exception 'user_id introuvable : renseigner la table app_owner';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- games
-- ------------------------------------------------------------
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chess_com_url text unique not null,
  played_at timestamptz not null,
  time_control text not null default 'rapid',
  color_played text not null check (color_played in ('white','black')),
  result text not null,
  eco text,
  opening_name text,
  pgn text not null,
  analyzed boolean not null default false,
  created_at timestamptz not null default now()
);

create trigger games_set_user_id before insert on games
  for each row execute function set_user_id();

create index if not exists games_pending_analysis_idx
  on games (played_at desc) where analyzed = false;
create index if not exists games_user_played_idx on games (user_id, played_at desc);

-- ------------------------------------------------------------
-- mistakes
-- ------------------------------------------------------------
create table if not exists mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  fen text not null,
  ply_number int not null,
  move_played text not null,
  -- [{san, uci, cp, mate, pv:[{san,uci}]}] : tous les coups candidats du
  -- MultiPV dont le delta de winning chance reste au-dessus du seuil
  -- d'imprécision. Un coup joué figurant ici est compté comme réussi.
  accepted_moves jsonb not null,
  -- [{san, uci}] : 6-8 demi-coups depuis la position APRÈS `move_played`,
  -- montrant la réfutation.
  punishment_pv jsonb not null,
  category text not null check (category in ('inaccuracy','mistake','blunder')),
  themes text[] not null default '{}',
  card_type text not null default 'mistake',
  fsrs_stability float,
  fsrs_difficulty float,
  fsrs_due_at timestamptz not null default now(),
  times_seen int not null default 0,
  times_correct int not null default 0,
  times_incorrect int not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, ply_number)
);

create trigger mistakes_set_user_id before insert on mistakes
  for each row execute function set_user_id();

create index if not exists mistakes_due_idx on mistakes (user_id, fsrs_due_at);
create index if not exists mistakes_themes_idx on mistakes using gin (themes);

-- ------------------------------------------------------------
-- repertoire_nodes — placeholder phase 2, aucune logique branchée dessus
-- ------------------------------------------------------------
create table if not exists repertoire_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fen text not null,
  side text check (side in ('white','black')),
  parent_node_id uuid references repertoire_nodes(id) on delete cascade,
  move_san text,
  source text,
  popularity numeric,
  is_book_end boolean default false,
  card_type text not null default 'repertoire_line',
  fsrs_stability float,
  fsrs_difficulty float,
  fsrs_due_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger repertoire_nodes_set_user_id before insert on repertoire_nodes
  for each row execute function set_user_id();

-- Le script d'analyse interroge cette table par (fen, move_san) pour
-- l'exception "book move".
create index if not exists repertoire_nodes_fen_idx on repertoire_nodes (fen, move_san);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table app_owner enable row level security;
alter table games enable row level security;
alter table mistakes enable row level security;
alter table repertoire_nodes enable row level security;

create policy app_owner_select on app_owner for select using (user_id = auth.uid());

create policy games_all on games for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy mistakes_all on mistakes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy repertoire_nodes_all on repertoire_nodes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
