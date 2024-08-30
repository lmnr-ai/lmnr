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
-- Name: project_api_keys project_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_api_keys
    ADD CONSTRAINT project_api_keys_pkey PRIMARY KEY (value);


--
-- Name: project_api_keys public_project_api_keys_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_api_keys
    ADD CONSTRAINT public_project_api_keys_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE project_api_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_api_keys TO anon;
GRANT ALL ON TABLE public.project_api_keys TO authenticated;
GRANT ALL ON TABLE public.project_api_keys TO service_role;


--
-- PostgreSQL database dump complete
--

