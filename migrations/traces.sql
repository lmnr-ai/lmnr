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
-- Name: traces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.traces (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pipeline_version_id uuid NOT NULL,
    success boolean DEFAULT true NOT NULL,
    start_time timestamp with time zone DEFAULT now() NOT NULL,
    end_time timestamp with time zone DEFAULT now() NOT NULL,
    total_token_count bigint DEFAULT '0'::bigint NOT NULL,
    approximate_cost double precision,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_type text NOT NULL,
    output_message_ids jsonb DEFAULT '[]'::jsonb NOT NULL
);


ALTER TABLE public.traces OWNER TO postgres;

--
-- Name: COLUMN traces.output_message_ids; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.traces.output_message_ids IS 'Array of Uuid values that point to output_messages';


--
-- Name: traces traces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.traces
    ADD CONSTRAINT traces_pkey PRIMARY KEY (run_id);


--
-- Name: traces_pipeline_version_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX traces_pipeline_version_id_idx ON public.traces USING btree (pipeline_version_id);


--
-- Name: traces_run_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX traces_run_type_idx ON public.traces USING hash (run_type);


--
-- Name: traces traces_pipeline_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.traces
    ADD CONSTRAINT traces_pipeline_version_id_fkey FOREIGN KEY (pipeline_version_id) REFERENCES public.pipeline_versions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: traces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE traces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.traces TO anon;
GRANT ALL ON TABLE public.traces TO authenticated;
GRANT ALL ON TABLE public.traces TO service_role;


--
-- PostgreSQL database dump complete
--

