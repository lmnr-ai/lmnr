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
-- Name: COLUMN pipelines.visibility; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pipelines.visibility IS 'Whether the pipeline is public or private';


--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- Name: pipelines unique_project_id_pipeline_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT unique_project_id_pipeline_name UNIQUE (project_id, name);


--
-- Name: pipelines_name_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pipelines_name_project_id_idx ON public.pipelines USING btree (name, project_id);


--
-- Name: pipelines_project_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pipelines_project_id_idx ON public.pipelines USING btree (project_id);


--
-- Name: pipelines pipelines_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE pipelines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pipelines TO anon;
GRANT ALL ON TABLE public.pipelines TO authenticated;
GRANT ALL ON TABLE public.pipelines TO service_role;


--
-- PostgreSQL database dump complete
--

