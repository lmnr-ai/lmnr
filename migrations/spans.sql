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
-- Name: spans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.spans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    version text NOT NULL,
    trace_id uuid NOT NULL,
    parent_span_id uuid,
    name text NOT NULL,
    attributes jsonb NOT NULL,
    metadata jsonb NOT NULL,
    input jsonb,
    output jsonb,
    span_type public.span_type NOT NULL
);


ALTER TABLE public.spans OWNER TO postgres;

--
-- Name: COLUMN spans.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.spans.version IS 'Laminar''s version of span implementation';


--
-- Name: spans spans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spans
    ADD CONSTRAINT spans_pkey PRIMARY KEY (id);


--
-- Name: spans_trace_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX spans_trace_id_idx ON public.spans USING btree (trace_id);


--
-- Name: spans spans_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spans
    ADD CONSTRAINT spans_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.new_traces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: spans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.spans ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE spans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.spans TO anon;
GRANT ALL ON TABLE public.spans TO authenticated;
GRANT ALL ON TABLE public.spans TO service_role;


--
-- PostgreSQL database dump complete
--

