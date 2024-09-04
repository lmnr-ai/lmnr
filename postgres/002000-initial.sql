--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 16.3

-- Started on 2024-09-04 10:00:29 PDT

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 24 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS public; -- manually updated with IF NOT EXISTS


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 4200 (class 0 OID 0)
-- Dependencies: 24
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 1464 (class 1247 OID 29118)
-- Name: checkjobstatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.checkjobstatus AS ENUM (
    'Running',
    'Passed',
    'NotPassed',
    'ExecError'
);


ALTER TYPE public.checkjobstatus OWNER TO postgres;

--
-- TOC entry 1305 (class 1247 OID 1295761)
-- Name: evaluation_job_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.evaluation_job_status AS ENUM (
    'Started',
    'Finished',
    'Error'
);


ALTER TYPE public.evaluation_job_status OWNER TO postgres;

--
-- TOC entry 4202 (class 0 OID 0)
-- Dependencies: 1305
-- Name: TYPE evaluation_job_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.evaluation_job_status IS 'Status of an evaluation job';


--
-- TOC entry 1377 (class 1247 OID 1295859)
-- Name: evaluation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.evaluation_status AS ENUM (
    'Success',
    'Error'
);


ALTER TYPE public.evaluation_status OWNER TO postgres;

--
-- TOC entry 4203 (class 0 OID 0)
-- Dependencies: 1377
-- Name: TYPE evaluation_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE public.evaluation_status IS 'Status of an evaluation datapoint run';


--
-- TOC entry 1348 (class 1247 OID 599805)
-- Name: event_source; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.event_source AS ENUM (
    'AUTO',
    'MANUAL',
    'CODE'
);


ALTER TYPE public.event_source OWNER TO postgres;

--
-- TOC entry 1383 (class 1247 OID 827293)
-- Name: event_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.event_type AS ENUM (
    'BOOLEAN',
    'STRING',
    'NUMBER'
);


ALTER TYPE public.event_type OWNER TO postgres;

--
-- TOC entry 1449 (class 1247 OID 496779)
-- Name: span_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.span_type AS ENUM (
    'DEFAULT',
    'LLM'
);


ALTER TYPE public.span_type OWNER TO postgres;

--
-- TOC entry 1342 (class 1247 OID 120632)
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.workspace_role AS ENUM (
    'member',
    'owner'
);


ALTER TYPE public.workspace_role OWNER TO postgres;

--
-- TOC entry 673 (class 1255 OID 29151)
-- Name: api_key(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.api_key() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select
  	coalesce(
		nullif(current_setting('request.jwt.claim.sub', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
	)::text
$$;


ALTER FUNCTION public.api_key() OWNER TO postgres;

--
-- TOC entry 640 (class 1255 OID 353164)
-- Name: is_endpoint_id_accessible_for_api_key(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_endpoint_id_accessible_for_api_key(_api_key text, _endpoint_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$WITH workspace_ids_for_user(workspace_id) AS (
    SELECT workspace_id from members_of_workspaces where user_id = (
        SELECT user_id from api_keys WHERE api_key = _api_key
    ) 
),
endpoint_ids(id) AS (
    SELECT id from endpoints where project_id in (   
        SELECT id from projects WHERE workspace_id in (
            SELECT workspace_id from workspace_ids_for_user
        )
    )
)
select _endpoint_id in (select id from endpoint_ids)$$;


ALTER FUNCTION public.is_endpoint_id_accessible_for_api_key(_api_key text, _endpoint_id uuid) OWNER TO postgres;

--
-- TOC entry 639 (class 1255 OID 62127)
-- Name: is_evaluation_id_accessible_for_api_key(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_evaluation_id_accessible_for_api_key(_api_key text, _evaluation_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$WITH workspace_ids_for_user(workspace_id) AS (
    SELECT workspace_id from members_of_workspaces where user_id = (
        SELECT user_id from api_keys WHERE api_key = _api_key
    ) 
),
evaluation_ids(id) AS (
    SELECT id from evaluations where project_id in (   
        SELECT id from projects WHERE workspace_id in (
            SELECT workspace_id from workspace_ids_for_user
        )
    )
)
select _evaluation_id in (select id from evaluation_ids)$$;


ALTER FUNCTION public.is_evaluation_id_accessible_for_api_key(_api_key text, _evaluation_id uuid) OWNER TO postgres;

--
-- TOC entry 660 (class 1255 OID 29152)
-- Name: is_pipeline_id_accessible_for_api_key(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_pipeline_id_accessible_for_api_key(_api_key text, _pipeline_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$WITH workspace_ids_for_user(workspace_id) AS (
    SELECT workspace_id from members_of_workspaces where user_id = (
        SELECT user_id from api_keys WHERE api_key = _api_key
    ) 
),
pipeline_ids(id) AS (
    SELECT id from pipelines where project_id in (   
        SELECT id from projects WHERE workspace_id in (
            SELECT workspace_id from workspace_ids_for_user
        )
    )
)
select _pipeline_id in (select id from pipeline_ids)$$;


ALTER FUNCTION public.is_pipeline_id_accessible_for_api_key(_api_key text, _pipeline_id uuid) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 376 (class 1259 OID 29153)
-- Name: api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_keys (
    api_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    name text DEFAULT 'default'::text NOT NULL
);


ALTER TABLE public.api_keys OWNER TO postgres;

--
-- TOC entry 377 (class 1259 OID 29160)
-- Name: dataset_datapoints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_datapoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    data jsonb NOT NULL,
    indexed_on text,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    index_in_batch bigint
);


ALTER TABLE public.dataset_datapoints OWNER TO postgres;

--
-- TOC entry 4209 (class 0 OID 0)
-- Dependencies: 377
-- Name: COLUMN dataset_datapoints.indexed_on; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.dataset_datapoints.indexed_on IS 'Name of column on which this datapoint is indexed, if any';


--
-- TOC entry 4210 (class 0 OID 0)
-- Dependencies: 377
-- Name: COLUMN dataset_datapoints.index_in_batch; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.dataset_datapoints.index_in_batch IS 'When batch datapoints are added, we need to keep the index. This is opaque to the user';


--
-- TOC entry 378 (class 1259 OID 29167)
-- Name: datasets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    project_id uuid DEFAULT gen_random_uuid() NOT NULL,
    indexed_on text
);


ALTER TABLE public.datasets OWNER TO postgres;

--
-- TOC entry 415 (class 1259 OID 1295668)
-- Name: evaluation_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.evaluation_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    evaluation_id uuid NOT NULL,
    data jsonb NOT NULL,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.evaluation_status NOT NULL,
    evaluator_trace_id uuid,
    executor_trace_id uuid,
    executor_output jsonb,
    index_in_batch bigint,
    error jsonb,
    scores jsonb NOT NULL
);


ALTER TABLE public.evaluation_results OWNER TO postgres;

--
-- TOC entry 4213 (class 0 OID 0)
-- Dependencies: 415
-- Name: COLUMN evaluation_results.index_in_batch; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.evaluation_results.index_in_batch IS 'When batch datapoints are added, we need to keep the index. This is opaque to the user';


--
-- TOC entry 416 (class 1259 OID 1295683)
-- Name: evaluations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status public.evaluation_job_status DEFAULT 'Started'::public.evaluation_job_status NOT NULL,
    metadata jsonb
);


ALTER TABLE public.evaluations OWNER TO postgres;

--
-- TOC entry 4215 (class 0 OID 0)
-- Dependencies: 416
-- Name: COLUMN evaluations.metadata; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.evaluations.metadata IS 'Any additional metadata to associate with eval job';


--
-- TOC entry 412 (class 1259 OID 609790)
-- Name: event_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    project_id uuid NOT NULL,
    description text,
    event_type public.event_type DEFAULT 'BOOLEAN'::public.event_type NOT NULL,
    instruction text
);


ALTER TABLE public.event_templates OWNER TO postgres;

--
-- TOC entry 4217 (class 0 OID 0)
-- Dependencies: 412
-- Name: TABLE event_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.event_templates IS 'Event types';


--
-- TOC entry 411 (class 1259 OID 577200)
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    span_id uuid NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    template_id uuid NOT NULL,
    source public.event_source NOT NULL,
    metadata jsonb,
    value jsonb NOT NULL,
    data text,
    inputs jsonb
);


ALTER TABLE public.events OWNER TO postgres;

--
-- TOC entry 4219 (class 0 OID 0)
-- Dependencies: 411
-- Name: COLUMN events.data; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.data IS 'Data that was sent to automatic event evaluation';


--
-- TOC entry 383 (class 1259 OID 29260)
-- Name: members_of_workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members_of_workspaces (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_role public.workspace_role DEFAULT 'owner'::public.workspace_role NOT NULL
);


ALTER TABLE public.members_of_workspaces OWNER TO postgres;

--
-- TOC entry 391 (class 1259 OID 41923)
-- Name: pipeline_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pipeline_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    runnable_graph jsonb DEFAULT '{}'::jsonb NOT NULL,
    displayable_graph jsonb DEFAULT '{}'::jsonb NOT NULL,
    number_of_nodes bigint NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    display_group text DEFAULT 'build'::text NOT NULL,
    ordinal integer DEFAULT 500 NOT NULL
);


ALTER TABLE public.pipeline_templates OWNER TO postgres;

--
-- TOC entry 384 (class 1259 OID 29289)
-- Name: pipeline_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pipeline_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_id uuid NOT NULL,
    displayable_graph jsonb NOT NULL,
    runnable_graph jsonb NOT NULL,
    pipeline_type text NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.pipeline_versions OWNER TO postgres;

--
-- TOC entry 385 (class 1259 OID 29296)
-- Name: pipelines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    visibility text DEFAULT 'PRIVATE'::text NOT NULL,
    python_requirements text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.pipelines OWNER TO postgres;

--
-- TOC entry 4224 (class 0 OID 0)
-- Dependencies: 385
-- Name: COLUMN pipelines.visibility; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pipelines.visibility IS 'Whether the pipeline is public or private';


--
-- TOC entry 386 (class 1259 OID 29303)
-- Name: project_api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_api_keys (
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    project_id uuid NOT NULL
);


ALTER TABLE public.project_api_keys OWNER TO postgres;

--
-- TOC entry 387 (class 1259 OID 29309)
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    workspace_id uuid NOT NULL
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- TOC entry 388 (class 1259 OID 29316)
-- Name: run_count; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.run_count (
    workspace_id uuid DEFAULT gen_random_uuid() NOT NULL,
    total_count bigint DEFAULT '0'::bigint NOT NULL,
    count_since_reset bigint DEFAULT '0'::bigint NOT NULL,
    reset_time timestamp with time zone DEFAULT now() NOT NULL,
    reset_reason text DEFAULT 'signup'::text NOT NULL,
    codegen_total_count bigint DEFAULT '0'::bigint NOT NULL,
    codegen_count_since_reset bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE public.run_count OWNER TO postgres;

--
-- TOC entry 417 (class 1259 OID 1784874)
-- Name: spans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.spans (
    span_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_span_id uuid,
    name text NOT NULL,
    attributes jsonb NOT NULL,
    input jsonb,
    output jsonb,
    span_type public.span_type NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    trace_id uuid NOT NULL,
    version text NOT NULL
);


ALTER TABLE public.spans OWNER TO postgres;

--
-- TOC entry 394 (class 1259 OID 49776)
-- Name: subscription_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscription_tiers (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    pipeline_runs_per_month bigint NOT NULL,
    storage_mib bigint NOT NULL,
    log_retention_days bigint NOT NULL,
    members_per_workspace bigint DEFAULT '-1'::bigint NOT NULL,
    num_workspaces bigint DEFAULT '-1'::bigint NOT NULL,
    projects_per_workspace bigint DEFAULT '1'::bigint NOT NULL,
    stripe_product_id text DEFAULT ''::text NOT NULL,
    pipeline_pulls_per_month bigint DEFAULT '-1'::bigint NOT NULL
);


ALTER TABLE public.subscription_tiers OWNER TO postgres;

--
-- TOC entry 4230 (class 0 OID 0)
-- Dependencies: 394
-- Name: COLUMN subscription_tiers.storage_mib; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.subscription_tiers.storage_mib IS 'Storage space allocated in MibiBytes (1024 x 1024 bytes)';


--
-- TOC entry 395 (class 1259 OID 49779)
-- Name: subscription_tiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.subscription_tiers ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.subscription_tiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 413 (class 1259 OID 661476)
-- Name: target_pipeline_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.target_pipeline_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_id uuid NOT NULL,
    pipeline_version_id uuid NOT NULL
);


ALTER TABLE public.target_pipeline_versions OWNER TO postgres;

--
-- TOC entry 409 (class 1259 OID 494840)
-- Name: traces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    release text,
    user_id text,
    session_id text,
    metadata jsonb,
    project_id uuid NOT NULL,
    end_time timestamp with time zone,
    start_time timestamp with time zone,
    total_token_count bigint DEFAULT '0'::bigint NOT NULL,
    success boolean DEFAULT true NOT NULL,
    cost double precision DEFAULT '0'::double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.traces OWNER TO postgres;

--
-- TOC entry 4234 (class 0 OID 0)
-- Dependencies: 409
-- Name: COLUMN traces.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.traces.version IS 'Version of Laminar''s trace format';


--
-- TOC entry 4235 (class 0 OID 0)
-- Dependencies: 409
-- Name: COLUMN traces.release; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.traces.release IS 'User''s release version';


--
-- TOC entry 4236 (class 0 OID 0)
-- Dependencies: 409
-- Name: COLUMN traces.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.traces.user_id IS 'Laminar''s customers'' user id';


--
-- TOC entry 408 (class 1259 OID 351510)
-- Name: user_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    additional_seats bigint DEFAULT '0'::bigint NOT NULL,
    code_services bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE public.user_limits OWNER TO postgres;

--
-- TOC entry 4238 (class 0 OID 0)
-- Dependencies: 408
-- Name: TABLE user_limits; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_limits IS 'Overrides limits for each particular owner of workspace';


--
-- TOC entry 389 (class 1259 OID 29337)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    tier_id bigint DEFAULT '1'::bigint NOT NULL,
    additional_seats bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 390 (class 1259 OID 29344)
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- TOC entry 3937 (class 2606 OID 29352)
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (api_key);


--
-- TOC entry 3941 (class 2606 OID 29356)
-- Name: datasets datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_pkey PRIMARY KEY (id);


--
-- TOC entry 3991 (class 2606 OID 1295676)
-- Name: evaluation_results evaluation_results_pkey1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluation_results
    ADD CONSTRAINT evaluation_results_pkey1 PRIMARY KEY (id);


--
-- TOC entry 3993 (class 2606 OID 1295694)
-- Name: evaluations evaluations_pkey1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_pkey1 PRIMARY KEY (id);


--
-- TOC entry 3982 (class 2606 OID 609800)
-- Name: event_templates event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_templates
    ADD CONSTRAINT event_types_pkey PRIMARY KEY (id);


--
-- TOC entry 3980 (class 2606 OID 577209)
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- TOC entry 3943 (class 2606 OID 29374)
-- Name: members_of_workspaces members_of_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT members_of_organizations_pkey PRIMARY KEY (id);


--
-- TOC entry 3946 (class 2606 OID 29376)
-- Name: members_of_workspaces members_of_workspaces_user_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT members_of_workspaces_user_workspace_unique UNIQUE (user_id, workspace_id);


--
-- TOC entry 3996 (class 2606 OID 1784927)
-- Name: spans new_spans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spans
    ADD CONSTRAINT new_spans_pkey PRIMARY KEY (span_id);


--
-- TOC entry 3977 (class 2606 OID 494851)
-- Name: traces new_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.traces
    ADD CONSTRAINT new_traces_pkey PRIMARY KEY (id);


--
-- TOC entry 3967 (class 2606 OID 29382)
-- Name: workspaces organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- TOC entry 3971 (class 2606 OID 41936)
-- Name: pipeline_templates pipeline_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_templates
    ADD CONSTRAINT pipeline_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 3948 (class 2606 OID 29388)
-- Name: pipeline_versions pipeline_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_versions
    ADD CONSTRAINT pipeline_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 3951 (class 2606 OID 29392)
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- TOC entry 3956 (class 2606 OID 29394)
-- Name: project_api_keys project_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_api_keys
    ADD CONSTRAINT project_api_keys_pkey PRIMARY KEY (value);


--
-- TOC entry 3958 (class 2606 OID 29396)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- TOC entry 3961 (class 2606 OID 29398)
-- Name: run_count run_count_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_count
    ADD CONSTRAINT run_count_pkey PRIMARY KEY (workspace_id);


--
-- TOC entry 3963 (class 2606 OID 29400)
-- Name: run_count run_count_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_count
    ADD CONSTRAINT run_count_workspace_id_key UNIQUE (workspace_id);


--
-- TOC entry 3973 (class 2606 OID 49787)
-- Name: subscription_tiers subscription_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_tiers
    ADD CONSTRAINT subscription_tiers_pkey PRIMARY KEY (id);


--
-- TOC entry 3986 (class 2606 OID 661485)
-- Name: target_pipeline_versions target_pipeline_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT target_pipeline_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 3939 (class 2606 OID 29406)
-- Name: dataset_datapoints tmp_dataset_datapoints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_datapoints
    ADD CONSTRAINT tmp_dataset_datapoints_pkey PRIMARY KEY (id);


--
-- TOC entry 3984 (class 2606 OID 610207)
-- Name: event_templates unique_name_project_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_templates
    ADD CONSTRAINT unique_name_project_id UNIQUE (name, project_id);


--
-- TOC entry 3988 (class 2606 OID 662890)
-- Name: target_pipeline_versions unique_pipeline_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT unique_pipeline_id UNIQUE (pipeline_id);


--
-- TOC entry 3954 (class 2606 OID 664745)
-- Name: pipelines unique_project_id_pipeline_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT unique_project_id_pipeline_name UNIQUE (project_id, name);


--
-- TOC entry 3975 (class 2606 OID 351521)
-- Name: user_limits user_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_limits
    ADD CONSTRAINT user_limits_pkey PRIMARY KEY (id);


--
-- TOC entry 3965 (class 2606 OID 29412)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3969 (class 2606 OID 29414)
-- Name: workspaces workspaces_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_id_key UNIQUE (id);


--
-- TOC entry 3989 (class 1259 OID 1295677)
-- Name: evaluation_results_evaluation_id_idx1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX evaluation_results_evaluation_id_idx1 ON public.evaluation_results USING btree (evaluation_id);


--
-- TOC entry 3944 (class 1259 OID 106902)
-- Name: members_of_workspaces_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX members_of_workspaces_user_id_idx ON public.members_of_workspaces USING btree (user_id);


--
-- TOC entry 3978 (class 1259 OID 1067346)
-- Name: new_traces_session_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX new_traces_session_id_idx ON public.traces USING btree (session_id);


--
-- TOC entry 3949 (class 1259 OID 664722)
-- Name: pipelines_name_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pipelines_name_project_id_idx ON public.pipelines USING btree (name, project_id);


--
-- TOC entry 3952 (class 1259 OID 106909)
-- Name: pipelines_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pipelines_project_id_idx ON public.pipelines USING btree (project_id);


--
-- TOC entry 3959 (class 1259 OID 106908)
-- Name: projects_workspace_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX projects_workspace_id_idx ON public.projects USING btree (workspace_id);


--
-- TOC entry 3994 (class 1259 OID 1297172)
-- Name: unique_evaluation_name_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX unique_evaluation_name_project_id ON public.evaluations USING btree (project_id, name);


--
-- TOC entry 3997 (class 2606 OID 29416)
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4014 (class 2606 OID 1295792)
-- Name: evaluation_results evaluation_results_evaluation_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluation_results
    ADD CONSTRAINT evaluation_results_evaluation_id_fkey1 FOREIGN KEY (evaluation_id) REFERENCES public.evaluations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4015 (class 2606 OID 1295695)
-- Name: evaluations evaluations_project_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_project_id_fkey1 FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4011 (class 2606 OID 609801)
-- Name: event_templates event_types_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_templates
    ADD CONSTRAINT event_types_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4010 (class 2606 OID 680136)
-- Name: events events_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.event_templates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4000 (class 2606 OID 29426)
-- Name: members_of_workspaces members_of_organizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT members_of_organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4016 (class 2606 OID 1788751)
-- Name: spans new_spans_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spans
    ADD CONSTRAINT new_spans_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.traces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4009 (class 2606 OID 494852)
-- Name: traces new_traces_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.traces
    ADD CONSTRAINT new_traces_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4002 (class 2606 OID 29441)
-- Name: pipeline_versions pipeline_versions_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_versions
    ADD CONSTRAINT pipeline_versions_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4003 (class 2606 OID 29446)
-- Name: pipelines pipelines_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4005 (class 2606 OID 29451)
-- Name: projects projects_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_organization_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3999 (class 2606 OID 29456)
-- Name: datasets public_datasets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT public_datasets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4001 (class 2606 OID 29516)
-- Name: members_of_workspaces public_members_of_workspaces_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT public_members_of_workspaces_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4004 (class 2606 OID 29526)
-- Name: project_api_keys public_project_api_keys_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_api_keys
    ADD CONSTRAINT public_project_api_keys_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4006 (class 2606 OID 29531)
-- Name: run_count public_run_count_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_count
    ADD CONSTRAINT public_run_count_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3998 (class 2606 OID 29541)
-- Name: dataset_datapoints public_tmp_dataset_datapoints_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_datapoints
    ADD CONSTRAINT public_tmp_dataset_datapoints_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4012 (class 2606 OID 661486)
-- Name: target_pipeline_versions target_pipeline_versions_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT target_pipeline_versions_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4013 (class 2606 OID 661491)
-- Name: target_pipeline_versions target_pipeline_versions_pipeline_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT target_pipeline_versions_pipeline_version_id_fkey FOREIGN KEY (pipeline_version_id) REFERENCES public.pipeline_versions(id);


--
-- TOC entry 4008 (class 2606 OID 351522)
-- Name: user_limits user_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_limits
    ADD CONSTRAINT user_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4007 (class 2606 OID 51199)
-- Name: users users_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.subscription_tiers(id) ON UPDATE CASCADE;


--
-- TOC entry 4187 (class 3256 OID 29551)
-- Name: api_keys Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON public.api_keys TO service_role USING (true) WITH CHECK (true);


--
-- TOC entry 4188 (class 3256 OID 29553)
-- Name: users Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON public.users FOR INSERT TO service_role WITH CHECK (true);


--
-- TOC entry 4189 (class 3256 OID 29554)
-- Name: pipeline_versions all_actions_by_next_api_key; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY all_actions_by_next_api_key ON public.pipeline_versions TO authenticated, anon USING (public.is_pipeline_id_accessible_for_api_key(public.api_key(), pipeline_id));


--
-- TOC entry 4166 (class 0 OID 29153)
-- Dependencies: 376
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4167 (class 0 OID 29160)
-- Dependencies: 377
-- Name: dataset_datapoints; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dataset_datapoints ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4168 (class 0 OID 29167)
-- Dependencies: 378
-- Name: datasets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4184 (class 0 OID 1295668)
-- Dependencies: 415
-- Name: evaluation_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4185 (class 0 OID 1295683)
-- Dependencies: 416
-- Name: evaluations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4182 (class 0 OID 609790)
-- Dependencies: 412
-- Name: event_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4181 (class 0 OID 577200)
-- Dependencies: 411
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4169 (class 0 OID 29260)
-- Dependencies: 383
-- Name: members_of_workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.members_of_workspaces ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4177 (class 0 OID 41923)
-- Dependencies: 391
-- Name: pipeline_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipeline_templates ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4170 (class 0 OID 29289)
-- Dependencies: 384
-- Name: pipeline_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipeline_versions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4171 (class 0 OID 29296)
-- Dependencies: 385
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4172 (class 0 OID 29303)
-- Dependencies: 386
-- Name: project_api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_api_keys ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4173 (class 0 OID 29309)
-- Dependencies: 387
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4174 (class 0 OID 29316)
-- Dependencies: 388
-- Name: run_count; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.run_count ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4190 (class 3256 OID 1303626)
-- Name: evaluation_results select_by_next_api_key; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY select_by_next_api_key ON public.evaluation_results FOR SELECT TO authenticated, anon USING (public.is_evaluation_id_accessible_for_api_key(public.api_key(), evaluation_id));


--
-- TOC entry 4191 (class 3256 OID 1303688)
-- Name: evaluations select_by_next_api_key; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY select_by_next_api_key ON public.evaluations FOR SELECT TO authenticated, anon USING (public.is_evaluation_id_accessible_for_api_key(public.api_key(), id));


--
-- TOC entry 4186 (class 0 OID 1784874)
-- Dependencies: 417
-- Name: spans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.spans ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4178 (class 0 OID 49776)
-- Dependencies: 394
-- Name: subscription_tiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4183 (class 0 OID 661476)
-- Dependencies: 413
-- Name: target_pipeline_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.target_pipeline_versions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4180 (class 0 OID 494840)
-- Dependencies: 409
-- Name: traces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4179 (class 0 OID 351510)
-- Dependencies: 408
-- Name: user_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4175 (class 0 OID 29337)
-- Dependencies: 389
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4176 (class 0 OID 29344)
-- Dependencies: 390
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4201 (class 0 OID 0)
-- Dependencies: 24
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- TOC entry 4204 (class 0 OID 0)
-- Dependencies: 673
-- Name: FUNCTION api_key(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.api_key() TO anon;
GRANT ALL ON FUNCTION public.api_key() TO authenticated;
GRANT ALL ON FUNCTION public.api_key() TO service_role;


--
-- TOC entry 4205 (class 0 OID 0)
-- Dependencies: 640
-- Name: FUNCTION is_endpoint_id_accessible_for_api_key(_api_key text, _endpoint_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_endpoint_id_accessible_for_api_key(_api_key text, _endpoint_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_endpoint_id_accessible_for_api_key(_api_key text, _endpoint_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_endpoint_id_accessible_for_api_key(_api_key text, _endpoint_id uuid) TO service_role;


--
-- TOC entry 4206 (class 0 OID 0)
-- Dependencies: 639
-- Name: FUNCTION is_evaluation_id_accessible_for_api_key(_api_key text, _evaluation_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_evaluation_id_accessible_for_api_key(_api_key text, _evaluation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_evaluation_id_accessible_for_api_key(_api_key text, _evaluation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_evaluation_id_accessible_for_api_key(_api_key text, _evaluation_id uuid) TO service_role;


--
-- TOC entry 4207 (class 0 OID 0)
-- Dependencies: 660
-- Name: FUNCTION is_pipeline_id_accessible_for_api_key(_api_key text, _pipeline_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_pipeline_id_accessible_for_api_key(_api_key text, _pipeline_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_pipeline_id_accessible_for_api_key(_api_key text, _pipeline_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_pipeline_id_accessible_for_api_key(_api_key text, _pipeline_id uuid) TO service_role;


--
-- TOC entry 4208 (class 0 OID 0)
-- Dependencies: 376
-- Name: TABLE api_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;


--
-- TOC entry 4211 (class 0 OID 0)
-- Dependencies: 377
-- Name: TABLE dataset_datapoints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dataset_datapoints TO anon;
GRANT ALL ON TABLE public.dataset_datapoints TO authenticated;
GRANT ALL ON TABLE public.dataset_datapoints TO service_role;


--
-- TOC entry 4212 (class 0 OID 0)
-- Dependencies: 378
-- Name: TABLE datasets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.datasets TO anon;
GRANT ALL ON TABLE public.datasets TO authenticated;
GRANT ALL ON TABLE public.datasets TO service_role;


--
-- TOC entry 4214 (class 0 OID 0)
-- Dependencies: 415
-- Name: TABLE evaluation_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.evaluation_results TO anon;
GRANT ALL ON TABLE public.evaluation_results TO authenticated;
GRANT ALL ON TABLE public.evaluation_results TO service_role;


--
-- TOC entry 4216 (class 0 OID 0)
-- Dependencies: 416
-- Name: TABLE evaluations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.evaluations TO anon;
GRANT ALL ON TABLE public.evaluations TO authenticated;
GRANT ALL ON TABLE public.evaluations TO service_role;


--
-- TOC entry 4218 (class 0 OID 0)
-- Dependencies: 412
-- Name: TABLE event_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_templates TO anon;
GRANT ALL ON TABLE public.event_templates TO authenticated;
GRANT ALL ON TABLE public.event_templates TO service_role;


--
-- TOC entry 4220 (class 0 OID 0)
-- Dependencies: 411
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- TOC entry 4221 (class 0 OID 0)
-- Dependencies: 383
-- Name: TABLE members_of_workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.members_of_workspaces TO anon;
GRANT ALL ON TABLE public.members_of_workspaces TO authenticated;
GRANT ALL ON TABLE public.members_of_workspaces TO service_role;


--
-- TOC entry 4222 (class 0 OID 0)
-- Dependencies: 391
-- Name: TABLE pipeline_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipeline_templates TO anon;
GRANT ALL ON TABLE public.pipeline_templates TO authenticated;
GRANT ALL ON TABLE public.pipeline_templates TO service_role;


--
-- TOC entry 4223 (class 0 OID 0)
-- Dependencies: 384
-- Name: TABLE pipeline_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipeline_versions TO anon;
GRANT ALL ON TABLE public.pipeline_versions TO authenticated;
GRANT ALL ON TABLE public.pipeline_versions TO service_role;


--
-- TOC entry 4225 (class 0 OID 0)
-- Dependencies: 385
-- Name: TABLE pipelines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipelines TO anon;
GRANT ALL ON TABLE public.pipelines TO authenticated;
GRANT ALL ON TABLE public.pipelines TO service_role;


--
-- TOC entry 4226 (class 0 OID 0)
-- Dependencies: 386
-- Name: TABLE project_api_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_api_keys TO anon;
GRANT ALL ON TABLE public.project_api_keys TO authenticated;
GRANT ALL ON TABLE public.project_api_keys TO service_role;


--
-- TOC entry 4227 (class 0 OID 0)
-- Dependencies: 387
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- TOC entry 4228 (class 0 OID 0)
-- Dependencies: 388
-- Name: TABLE run_count; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.run_count TO anon;
GRANT ALL ON TABLE public.run_count TO authenticated;
GRANT ALL ON TABLE public.run_count TO service_role;


--
-- TOC entry 4229 (class 0 OID 0)
-- Dependencies: 417
-- Name: TABLE spans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.spans TO anon;
GRANT ALL ON TABLE public.spans TO authenticated;
GRANT ALL ON TABLE public.spans TO service_role;


--
-- TOC entry 4231 (class 0 OID 0)
-- Dependencies: 394
-- Name: TABLE subscription_tiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.subscription_tiers TO anon;
GRANT ALL ON TABLE public.subscription_tiers TO authenticated;
GRANT ALL ON TABLE public.subscription_tiers TO service_role;


--
-- TOC entry 4232 (class 0 OID 0)
-- Dependencies: 395
-- Name: SEQUENCE subscription_tiers_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.subscription_tiers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subscription_tiers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subscription_tiers_id_seq TO service_role;


--
-- TOC entry 4233 (class 0 OID 0)
-- Dependencies: 413
-- Name: TABLE target_pipeline_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.target_pipeline_versions TO anon;
GRANT ALL ON TABLE public.target_pipeline_versions TO authenticated;
GRANT ALL ON TABLE public.target_pipeline_versions TO service_role;


--
-- TOC entry 4237 (class 0 OID 0)
-- Dependencies: 409
-- Name: TABLE traces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.traces TO anon;
GRANT ALL ON TABLE public.traces TO authenticated;
GRANT ALL ON TABLE public.traces TO service_role;


--
-- TOC entry 4239 (class 0 OID 0)
-- Dependencies: 408
-- Name: TABLE user_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_limits TO anon;
GRANT ALL ON TABLE public.user_limits TO authenticated;
GRANT ALL ON TABLE public.user_limits TO service_role;


--
-- TOC entry 4240 (class 0 OID 0)
-- Dependencies: 389
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- TOC entry 4241 (class 0 OID 0)
-- Dependencies: 390
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workspaces TO anon;
GRANT ALL ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;


--
-- TOC entry 2743 (class 826 OID 16484)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2714 (class 826 OID 16485)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2744 (class 826 OID 16483)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2716 (class 826 OID 16487)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2745 (class 826 OID 16482)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2715 (class 826 OID 16486)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


-- Completed on 2024-09-04 10:00:40 PDT

--
-- PostgreSQL database dump complete
--

