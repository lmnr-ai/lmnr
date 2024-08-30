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
-- Name: run_count run_count_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_count
    ADD CONSTRAINT run_count_pkey PRIMARY KEY (workspace_id);


--
-- Name: run_count run_count_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_count
    ADD CONSTRAINT run_count_workspace_id_key UNIQUE (workspace_id);


--
-- Name: run_count public_run_count_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_count
    ADD CONSTRAINT public_run_count_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: run_count; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.run_count ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE run_count; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.run_count TO anon;
GRANT ALL ON TABLE public.run_count TO authenticated;
GRANT ALL ON TABLE public.run_count TO service_role;


--
-- PostgreSQL database dump complete
--

