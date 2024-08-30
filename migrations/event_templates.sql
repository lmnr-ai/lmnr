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
-- Name: TABLE event_templates; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.event_templates IS 'Event types';


--
-- Name: event_templates event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_templates
    ADD CONSTRAINT event_types_pkey PRIMARY KEY (id);


--
-- Name: event_templates unique_name_project_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_templates
    ADD CONSTRAINT unique_name_project_id UNIQUE (name, project_id);


--
-- Name: event_templates event_types_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_templates
    ADD CONSTRAINT event_types_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: event_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE event_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_templates TO anon;
GRANT ALL ON TABLE public.event_templates TO authenticated;
GRANT ALL ON TABLE public.event_templates TO service_role;


--
-- PostgreSQL database dump complete
--

