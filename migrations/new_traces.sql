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
-- Name: new_traces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.new_traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    release text,
    user_id text,
    session_id text NOT NULL,
    metadata jsonb,
    project_id uuid NOT NULL,
    end_time timestamp with time zone,
    start_time timestamp with time zone,
    total_token_count bigint DEFAULT '0'::bigint NOT NULL,
    success boolean DEFAULT true NOT NULL,
    cost double precision DEFAULT '0'::double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.new_traces OWNER TO postgres;

--
-- Name: COLUMN new_traces.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.new_traces.version IS 'Version of Laminar''s trace format';


--
-- Name: COLUMN new_traces.release; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.new_traces.release IS 'User''s release version';


--
-- Name: COLUMN new_traces.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.new_traces.user_id IS 'Laminar''s customers'' user id';


--
-- Name: new_traces new_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.new_traces
    ADD CONSTRAINT new_traces_pkey PRIMARY KEY (id);


--
-- Name: new_traces_session_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX new_traces_session_id_idx ON public.new_traces USING btree (session_id);


--
-- Name: new_traces new_traces_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.new_traces
    ADD CONSTRAINT new_traces_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: new_traces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.new_traces ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE new_traces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.new_traces TO anon;
GRANT ALL ON TABLE public.new_traces TO authenticated;
GRANT ALL ON TABLE public.new_traces TO service_role;


--
-- PostgreSQL database dump complete
--

