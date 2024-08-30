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
    data text
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: COLUMN events.data; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.events.data IS 'Data that was sent to automatic event evaluation';


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: events events_span_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_span_id_fkey FOREIGN KEY (span_id) REFERENCES public.spans(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.event_templates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- PostgreSQL database dump complete
--

