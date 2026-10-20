begin;

create table if not exists workspaces (
  id text primary key,
  name text not null,
  plan text not null
    check (
      plan in (
        'demo',
        'starter',
        'team',
        'enterprise'
      )
    ),
  created_at timestamptz not null
    default now()
);

create table if not exists workspace_members (
  id text not null,
  primary key (workspace_id, id),
  workspace_id text not null
    references workspaces(id)
    on delete cascade,
  email text not null,
  name text not null,
  role text not null
    check (
      role in (
        'owner',
        'admin',
        'engineer',
        'viewer'
      )
    ),
  created_at timestamptz not null
    default now(),
  unique (workspace_id, email)
);

create table if not exists infrastructure_risks (
  id text not null,
  primary key (workspace_id, id),
  workspace_id text not null
    references workspaces(id)
    on delete cascade,
  source text not null,
  service text not null,
  owner text not null,
  title text not null,
  detail text not null,
  category text not null,
  severity text not null,
  evidence jsonb not null
    default '[]'::jsonb,
  detected_at timestamptz not null,
  impact text not null,
  recommendation jsonb not null,
  status text not null
    check (
      status in (
        'open',
        'needs_approval',
        'approved',
        'executed',
        'dismissed'
      )
    ),
  approval_required boolean
    not null default true,
  routed_to text not null,
  updated_at timestamptz
    not null default now()
);

create index if not exists
  infrastructure_risks_workspace_status_idx
on infrastructure_risks (
  workspace_id,
  status
);

create table if not exists audit_events (
  id text not null,
  primary key (workspace_id, id),
  workspace_id text not null
    references workspaces(id)
    on delete cascade,
  risk_id text not null,
  risk_title text not null,
  action text not null
    check (
      action in (
        'approved',
        'dismissed',
        'executed',
        'scan'
      )
    ),
  actor text not null,
  detail text not null,
  request_id text,
  created_at timestamptz
    not null default now()
);

alter table audit_events
  add column if not exists
  request_id text;

create index if not exists
  audit_events_workspace_created_idx
on audit_events (
  workspace_id,
  created_at desc
);

create table if not exists execution_events (
  id text not null,
  primary key (workspace_id, id),
  workspace_id text not null
    references workspaces(id)
    on delete cascade,
  risk_id text not null,
  title text not null,
  owner text not null,
  mode text not null,
  command_preview text,

  request_id text,
  requested_by text,

  approved_by text,
  approved_at timestamptz,
  approval_request_id text,

  before_status text,
  after_status text,
  outcome text,

  steps jsonb not null
    default '[]'::jsonb,

  created_at timestamptz
    not null default now()
);

alter table execution_events
  add column if not exists
  request_id text;

alter table execution_events
  add column if not exists
  requested_by text;

alter table execution_events
  add column if not exists
  approved_by text;

alter table execution_events
  add column if not exists
  approved_at timestamptz;

alter table execution_events
  add column if not exists
  approval_request_id text;

alter table execution_events
  add column if not exists
  before_status text;

alter table execution_events
  add column if not exists
  after_status text;

alter table execution_events
  add column if not exists
  outcome text;

create index if not exists
  execution_events_workspace_created_idx
on execution_events (
  workspace_id,
  created_at desc
);

create index if not exists
  execution_events_risk_idx
on execution_events (
  workspace_id,
  risk_id
);

alter table workspaces add column if not exists demo_seeded_at timestamptz;

-- Keep existing demo data and metadata; upgrading must not trigger another seed.
update workspaces w set demo_seeded_at = now()
where w.id = 'workspace-demo' and w.demo_seeded_at is null
  and (exists (select 1 from infrastructure_risks r where r.workspace_id = w.id)
    or exists (select 1 from audit_events a where a.workspace_id = w.id));

-- Upgrade the original single-column keys without deleting or moving records.
-- Unexpected keys/dependencies fail the transaction instead of cascading drops.
do $$
declare
  table_name text;
  old_key record;
begin
  foreach table_name in array array['workspace_members', 'infrastructure_risks', 'audit_events', 'execution_events'] loop
    select conname, pg_get_constraintdef(oid) as definition into old_key
      from pg_constraint where conrelid = to_regclass(table_name) and contype = 'p';
    if old_key.definition = 'PRIMARY KEY (id)' then
      execute format('alter table %I drop constraint %I', table_name, old_key.conname);
      execute format('alter table %I add primary key (workspace_id, id)', table_name);
    elsif old_key.definition is distinct from 'PRIMARY KEY (workspace_id, id)' then
      raise exception 'Unexpected primary key on %; migration stopped', table_name;
    end if;
  end loop;
end $$;

commit;
