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
-- Name: dataset_datapoints; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dataset_datapoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    data jsonb NOT NULL,
    indexed_on text,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    index_in_batch bigint
);


ALTER TABLE public.dataset_datapoints OWNER TO postgres;

--
-- Name: COLUMN dataset_datapoints.indexed_on; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.dataset_datapoints.indexed_on IS 'Name of column on which this datapoint is indexed, if any';


--
-- Name: COLUMN dataset_datapoints.index_in_batch; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.dataset_datapoints.index_in_batch IS 'When batch datapoints are added, we need to keep the index. This is opaque to the user';


--
-- Name: dataset_datapoints tmp_dataset_datapoints_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_datapoints
    ADD CONSTRAINT tmp_dataset_datapoints_pkey PRIMARY KEY (id);


--
-- Name: dataset_datapoints public_tmp_dataset_datapoints_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dataset_datapoints
    ADD CONSTRAINT public_tmp_dataset_datapoints_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: dataset_datapoints; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dataset_datapoints ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE dataset_datapoints; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dataset_datapoints TO anon;
GRANT ALL ON TABLE public.dataset_datapoints TO authenticated;
GRANT ALL ON TABLE public.dataset_datapoints TO service_role;


--
-- PostgreSQL database dump complete
--

