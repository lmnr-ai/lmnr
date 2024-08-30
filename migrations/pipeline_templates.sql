--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 16.3

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
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
-- Name: pipeline_templates pipeline_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_templates
    ADD CONSTRAINT pipeline_templates_pkey PRIMARY KEY (id);


--
-- Name: pipeline_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipeline_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE pipeline_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipeline_templates TO anon;
GRANT ALL ON TABLE public.pipeline_templates TO authenticated;
GRANT ALL ON TABLE public.pipeline_templates TO service_role;


--
-- PostgreSQL database dump complete
--

