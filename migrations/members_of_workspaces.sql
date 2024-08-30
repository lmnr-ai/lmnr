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
-- Name: members_of_workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members_of_workspaces (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_role public.workspace_role DEFAULT 'owner'::public.workspace_role NOT NULL
);


ALTER TABLE public.members_of_workspaces OWNER TO postgres;

--
-- Name: members_of_workspaces members_of_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT members_of_organizations_pkey PRIMARY KEY (id);


--
-- Name: members_of_workspaces members_of_workspaces_user_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT members_of_workspaces_user_workspace_unique UNIQUE (user_id, workspace_id);


--
-- Name: members_of_workspaces_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX members_of_workspaces_user_id_idx ON public.members_of_workspaces USING btree (user_id);


--
-- Name: members_of_workspaces members_of_organizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT members_of_organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: members_of_workspaces public_members_of_workspaces_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members_of_workspaces
    ADD CONSTRAINT public_members_of_workspaces_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: members_of_workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.members_of_workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE members_of_workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.members_of_workspaces TO anon;
GRANT ALL ON TABLE public.members_of_workspaces TO authenticated;
GRANT ALL ON TABLE public.members_of_workspaces TO service_role;


--
-- PostgreSQL database dump complete
--

