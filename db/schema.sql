create table if not exists workspaces (
  id text primary key,
  name text not null,
  plan text not null check (plan in ('demo', 'starter', 'team', 'enterprise')),
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('owner', 'admin', 'engineer', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists infrastructure_risks (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  source text not null,
  service text not null,
  owner text not null,
  title text not null,
  detail text not null,
  category text not null,
  severity text not null,
  evidence jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null,
  impact text not null,
  recommendation jsonb not null,
  status text not null check (status in ('open', 'needs_approval', 'approved', 'executed', 'dismissed')),
  approval_required boolean not null default true,
  routed_to text not null,
  updated_at timestamptz not null default now()
);

create index if not exists infrastructure_risks_workspace_status_idx
  on infrastructure_risks(workspace_id, status);

create table if not exists audit_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  risk_id text not null,
  risk_title text not null,
  action text not null check (action in ('approved', 'dismissed', 'executed', 'scan')),
  actor text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_workspace_created_idx
  on audit_events(workspace_id, created_at desc);

create table if not exists execution_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  risk_id text not null,
  title text not null,
  owner text not null,
  mode text not null,
  command_preview text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists execution_events_workspace_created_idx
  on execution_events(workspace_id, created_at desc);
