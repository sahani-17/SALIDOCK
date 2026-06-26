-- SQL Migrations for SALIDOCK Backend

-- Sessions table
create table if not exists public.docking_sessions (
  id text primary key,
  protein_name text,
  ligand_name text,
  status text default 'active' check (status in ('active', 'processing', 'completed', 'failed')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Docking results table
create table if not exists public.docking_results (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.docking_sessions(id) on delete cascade,
  best_affinity float,
  num_poses int,
  cavity_count int,
  docking_mode text,
  results_file_path text,
  report_json jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes
create index if not exists idx_docking_results_session_id on public.docking_results(session_id);
create index if not exists idx_docking_sessions_created_at on public.docking_sessions(created_at);

-- Enable RLS (Row Level Security)
alter table public.docking_sessions enable row level security;
alter table public.docking_results enable row level security;

-- RLS Policies (allow public read/write for now - restrict later if needed)
drop policy if exists "allow public read sessions" on public.docking_sessions;
create policy "allow public read sessions"
on public.docking_sessions
for select
using (true);

drop policy if exists "allow public insert sessions" on public.docking_sessions;
create policy "allow public insert sessions"
on public.docking_sessions
for insert
with check (true);

drop policy if exists "allow public read results" on public.docking_results;
create policy "allow public read results"
on public.docking_results
for select
using (true);

drop policy if exists "allow public insert results" on public.docking_results;
create policy "allow public insert results"
on public.docking_results
for insert
with check (true);

-- Result feedback table (for user feedback)
create table if not exists public.result_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.docking_sessions(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  description text not null,
  username text,
  user_id uuid null,
  created_at timestamp with time zone default now()
);

-- Index for feedback queries
create index if not exists idx_result_feedback_session_id on public.result_feedback(session_id);

-- RLS for feedback
alter table public.result_feedback enable row level security;

drop policy if exists "allow authenticated read all feedback" on public.result_feedback;
create policy "allow authenticated read all feedback"
on public.result_feedback
for select
to authenticated
using (true);

drop policy if exists "allow authenticated insert feedback" on public.result_feedback;
create policy "allow authenticated insert feedback"
on public.result_feedback
for insert
to authenticated
with check (true);
