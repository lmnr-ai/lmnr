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
-- Name: target_pipeline_versions target_pipeline_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT target_pipeline_versions_pkey PRIMARY KEY (id);


--
-- Name: target_pipeline_versions unique_pipeline_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT unique_pipeline_id UNIQUE (pipeline_id);


--
-- Name: target_pipeline_versions target_pipeline_versions_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT target_pipeline_versions_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: target_pipeline_versions target_pipeline_versions_pipeline_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.target_pipeline_versions
    ADD CONSTRAINT target_pipeline_versions_pipeline_version_id_fkey FOREIGN KEY (pipeline_version_id) REFERENCES public.pipeline_versions(id);


--
-- Name: target_pipeline_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.target_pipeline_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE target_pipeline_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.target_pipeline_versions TO anon;
GRANT ALL ON TABLE public.target_pipeline_versions TO authenticated;
GRANT ALL ON TABLE public.target_pipeline_versions TO service_role;


--
-- PostgreSQL database dump complete
--

