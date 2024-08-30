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
-- Name: nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_version_id uuid NOT NULL,
    type text NOT NULL,
    state jsonb
);


ALTER TABLE public.nodes OWNER TO postgres;

--
-- Name: nodes nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (id, pipeline_version_id);


--
-- Name: nodes public_nodes_pipeline_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT public_nodes_pipeline_version_id_fkey FOREIGN KEY (pipeline_version_id) REFERENCES public.pipeline_versions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: nodes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE nodes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.nodes TO anon;
GRANT ALL ON TABLE public.nodes TO authenticated;
GRANT ALL ON TABLE public.nodes TO service_role;


--
-- PostgreSQL database dump complete
--

