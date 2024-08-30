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
-- Name: pipeline_versions pipeline_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_versions
    ADD CONSTRAINT pipeline_versions_pkey PRIMARY KEY (id);


--
-- Name: pipeline_versions pipeline_versions_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_versions
    ADD CONSTRAINT pipeline_versions_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pipeline_versions all_actions_by_next_api_key; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY all_actions_by_next_api_key ON public.pipeline_versions TO authenticated, anon USING (public.is_pipeline_id_accessible_for_api_key(public.api_key(), pipeline_id));


--
-- Name: pipeline_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipeline_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE pipeline_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipeline_versions TO anon;
GRANT ALL ON TABLE public.pipeline_versions TO authenticated;
GRANT ALL ON TABLE public.pipeline_versions TO service_role;


--
-- PostgreSQL database dump complete
--

