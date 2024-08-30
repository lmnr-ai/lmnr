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
-- Name: evaluation_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.evaluation_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    evaluation_id uuid NOT NULL,
    data jsonb NOT NULL,
    target jsonb,
    score double precision,
    status text NOT NULL,
    evaluator_run_id uuid,
    executor_run_id uuid,
    executor_output jsonb,
    index_in_batch bigint,
    error jsonb
);


ALTER TABLE public.evaluation_results OWNER TO postgres;

--
-- Name: COLUMN evaluation_results.index_in_batch; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.evaluation_results.index_in_batch IS 'When batch datapoints are added, we need to keep the index. This is opaque to the user';


--
-- Name: evaluation_results evaluation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluation_results
    ADD CONSTRAINT evaluation_results_pkey PRIMARY KEY (id);


--
-- Name: evaluation_results_evaluation_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX evaluation_results_evaluation_id_idx ON public.evaluation_results USING btree (evaluation_id);


--
-- Name: evaluation_results evaluation_results_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evaluation_results
    ADD CONSTRAINT evaluation_results_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES public.evaluations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: evaluation_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluation_results select_by_next_api_key; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY select_by_next_api_key ON public.evaluation_results FOR SELECT TO authenticated, anon USING (public.is_evaluation_id_accessible_for_api_key(public.api_key(), evaluation_id));


--
-- Name: TABLE evaluation_results; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.evaluation_results TO anon;
GRANT ALL ON TABLE public.evaluation_results TO authenticated;
GRANT ALL ON TABLE public.evaluation_results TO service_role;


--
-- PostgreSQL database dump complete
--

