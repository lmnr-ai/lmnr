create table public.agent_messages (
  created_at timestamp with time zone not null default now(),
  id uuid not null DEFAULT gen_random_uuid(),
  chat_id uuid not null,
  user_id uuid not null, -- for auth purposes
  message_type text not null DEFAULT '', -- this is to be updated to an enum
  content jsonb DEFAULT '{}'::jsonb,
  constraint agent_messages_pkey primary key (id),
  constraint agent_message_to_user_fkey foreign KEY (user_id) references users (id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;