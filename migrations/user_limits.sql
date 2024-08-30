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
-- Name: user_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    additional_seats bigint DEFAULT '0'::bigint NOT NULL,
    code_services bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE public.user_limits OWNER TO postgres;

--
-- Name: TABLE user_limits; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_limits IS 'Overrides limits for each particular owner of workspace';


--
-- Name: user_limits user_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_limits
    ADD CONSTRAINT user_limits_pkey PRIMARY KEY (id);


--
-- Name: user_limits user_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_limits
    ADD CONSTRAINT user_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE user_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_limits TO anon;
GRANT ALL ON TABLE public.user_limits TO authenticated;
GRANT ALL ON TABLE public.user_limits TO service_role;


--
-- PostgreSQL database dump complete
--

