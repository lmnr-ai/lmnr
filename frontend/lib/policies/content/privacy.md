---
title: "Privacy Notice - Laminar"
description: "How Laminar collects, uses, and protects personal data."
---

# Privacy Notice

**Last updated August 11, 2026**

This Privacy Notice describes how LMNR AI, Inc. (doing business as Laminar) ("**Laminar**," "**we**," "**us**," or "**our**") processes personal data in connection with our websites (including [laminar.sh](https://laminar.sh) and [lmnr.ai](https://lmnr.ai)) and our agent observability platform (together, the "**Services**").

It is organized in two parts, because we handle two very different kinds of data:

- **Part A — Personal data for which Laminar is the controller.** Data about you as an account holder, prospective customer, billing contact, or website visitor. We decide how and why this data is processed.
- **Part B — Customer Data we process on behalf of our customers.** The traces, model inputs and outputs, session recordings, evaluation records, and related content that customers send to the platform. For this data our customer is the controller (or the service provider of another controller) and Laminar is a processor acting on the customer's instructions under our [data processing agreement](mailto:founders@lmnr.ai).

**Questions?** Contact us at [founders@lmnr.ai](mailto:founders@lmnr.ai).

## Part A — Personal data Laminar controls

### A1. What we collect

**Account data.** When you create an account we collect your email address, display name, and profile picture. If you sign in through an identity provider (GitHub, Google, Microsoft, Okta, or Keycloak), we receive this profile information from that provider — this is information collected from a third party. We also store authentication session records.

**Workspace and team data.** Workspace names, membership and roles, and the email addresses of people you invite to your workspace.

**Billing data.** If you purchase a paid plan, payment is handled by Stripe. We share your email address and workspace name with Stripe and store subscription state; we do not store your card number. See Stripe's privacy notice at [stripe.com/privacy](https://stripe.com/privacy).

**Usage and device data.** We collect product analytics (pages viewed, features used) tied to your email address, and standard technical data such as IP address, browser, and device characteristics. Our analytics may include session replays of your interactions with our own application interface, with text inputs masked. We also collect error and performance diagnostics, which may include technical request metadata.

**Communications.** Emails you exchange with us, feedback, and support requests. If you sign up, we may add your email address and name to our product-communications audience.

**Cookies.** See our [Cookie Policy](/policies/cookies).

In our capacity as a controller we do not intentionally collect sensitive categories of personal data (such as health, biometric, or racial or ethnic data), and we ask that you do not send them to us. Customer Data is different — see Part B.

### A2. How and why we use it

- To create and manage accounts and workspaces, and to authenticate you (performance of a contract).
- To provide, maintain, and secure the Services, and to prevent fraud and abuse (contract; legitimate interests).
- To bill for paid plans and send transactional email such as invoices, usage alerts, workspace invitations, and configured platform notifications (contract).
- To understand how the product is used and improve it (legitimate interests).
- To send product updates and marketing you can opt out of at any time (legitimate interests / consent where required).
- To comply with law and enforce our terms (legal obligation; legitimate interests).

Where the GDPR or UK GDPR applies, the legal bases we rely on are shown in parentheses above. Where we rely on consent, you may withdraw it at any time. Note that this Part A does not cover model training on Customer Data, which is addressed in Part B.

### A3. Who we share it with

We share personal data with service providers that support our delivery of the Services — hosting and cloud infrastructure, model inference, payments, transactional and marketing email, product analytics, and error monitoring — under contracts that restrict their use of the data.

We also disclose personal data:

- **To integrations you connect.** For example, if a workspace connects Slack, we send configured alerts, digests, and reports to that Slack workspace.
- **To AI model providers.** Certain optional features send the content you are working with to a third-party model provider (Google Cloud or AWS Bedrock) to generate a response — see Part B.
- **In business transfers.** In connection with a merger, acquisition, financing, or sale of assets, subject to confidentiality obligations.
- **For legal reasons.** Where required by law or to protect rights, safety, and the integrity of the Services.

We do not sell personal data.

Where we act as a processor of Customer Data, the subprocessors we engage are listed in our [trust center](https://compliance.laminar.sh/?tab=subprocessors) (or provided under our data processing agreement).

### A4. How long we keep it

- Account and workspace data: for as long as your account exists, then deleted or anonymized within a reasonable period, except where law requires longer retention (for example tax and accounting records).
- Billing records: retained as required by tax and accounting law.
- Analytics and diagnostics: retained per our analytics providers' configured retention.

### A5. Security

We use appropriate organizational and technical measures to protect personal data, including encryption in transit, encrypted storage of integration credentials and provider API keys, and role-based access to workspaces. No system is perfectly secure, and we cannot guarantee absolute security.

### A6. Your rights

Depending on where you live, you may have rights to access, correct, delete, restrict, or port your personal data, to object to processing, and to withdraw consent. You can exercise these rights by emailing [founders@lmnr.ai](mailto:founders@lmnr.ai). We will respond in accordance with applicable law. You may also lodge a complaint with your local data protection authority; in the EEA see [your member state authority](https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm), in the UK the [ICO](https://ico.org.uk/make-a-complaint/), and in Switzerland the [FDPIC](https://www.edoeb.admin.ch/).

**US state privacy rights.** Residents of California, Delaware, and other states with comprehensive privacy laws may have the rights to know, access, correct, delete, and obtain a copy of personal data, the right to non-discrimination, and the right to opt out of targeted advertising, sale, or profiling. We do not sell personal data or use it for targeted advertising. In the categories used by California law, we collect: identifiers (name, email, IP address); commercial information (subscription history); and internet activity (product usage). We do not collect sensitive personal information as that term applies to our own collection; Customer Data processed on behalf of customers may contain personal information of any category, including sensitive personal information, as described in Part B — with respect to that data we act as a service provider. To exercise rights, or to appeal a decision, email [founders@lmnr.ai](mailto:founders@lmnr.ai); if your appeal is denied you may contact your state attorney general.

**Do-Not-Track.** There is no standard for DNT signals, and we do not respond to them at this time.

### A7. Minors

The Services are not directed to children under 18 and we do not knowingly collect their data as a controller. If you believe a minor has provided us data, contact [founders@lmnr.ai](mailto:founders@lmnr.ai).

## Part B — Customer Data we process on behalf of customers

### B1. What Customer Data is

Customers use Laminar to observe and evaluate AI agents. To do this, their applications send us **Customer Data**, which includes:

- **Traces and spans** — records of what an agent did, including model inputs and outputs, prompts, tool calls and results, attributes, and metadata (which can include end-user identifiers the customer chooses to attach, such as a user ID or session ID);
- **LLM message content** — the conversation content exchanged with language models;
- **Session recordings**— browser-session replays a customer's application captures and uploads;
- **Evaluation and dataset records** — test inputs, outputs, and scores;
- **Log records** the customer's application emits; and
- **Files and attachments** referenced by traces (for example images), stored in object storage.

**Customer Data can contain anything the customer's application handles.** If an end user tells a customer's agent about their health, finances, or anything else, that content arrives in the trace. It may therefore include personal data — including sensitive personal data — of the customer's end users. We do not receive this data from the end users themselves; we receive it from our customer, and we process it on the customer's documented instructions.

### B2. Roles and end-user requests

For Customer Data, the customer is the controller (or a service provider to another controller) and Laminar is a processor / service provider under our data processing agreement. If you are an end user of a customer's application and want to exercise privacy rights over data in that customer's traces, please contact that customer — we will support them in responding, as our agreement with them requires. If you contact us directly we will refer your request to the relevant customer where we can identify them.

### B3. What we do with Customer Data

We process Customer Data:

- to provide the platform — ingestion, storage, display, search, analytics, evaluations, and alerting;
- to run optional AI-assisted features the customer invokes or configures (for example failure detection, signal extraction, summarization, and AI-assisted queries). Some of these features send the relevant Customer Data to a third-party model provider (Google Cloud or AWS Bedrock) to generate a response at the time of use. We do not permit these providers to train on Customer Data. Playground features that use the customer's own model API keys send data to the provider the customer selects;
- to improve Laminar's own models, **only** using Signal Run Data from workspaces where Privacy Mode is off — see B4; and
- to secure the Services, meter usage, and bill.

Customer Data is stored with the cloud infrastructure providers listed in our [trust center](https://compliance.laminar.sh/?tab=subprocessors). Configured alert and report content derived from Customer Data is delivered through our email provider and, where connected, to the customer's Slack workspace.

### B4. Model training and Privacy Mode

Every workspace has a **Privacy Mode** setting. While Privacy Mode is on, we do not use that workspace's Customer Data to train or improve machine-learning models. Its default depends on the customer's plan: off by default on Free and Starter plans, on by default on Pro and higher plans, and on and enforced (not changeable) for accounts covered by a signed data processing agreement. Defaults apply only where the workspace owner has not made an explicit choice, an explicit choice survives plan changes, and a plan change never lowers a workspace's protection level. These defaults take effect for existing workspaces only on September 10, 2026, after the notice period.

While Privacy Mode is off, we may use that workspace's **Signal Run Data** — the trace content examined by the Signals feature during a run, and the outputs and intermediate reasoning our models produce in that run — to train and improve the models that power Signals, subject to the commitments in our [Terms of Service](/policies/terms) and described on our [Data Use page](/policies/data-use): only Signal Run Data generated on or after September 10, 2026 is used (earlier data requires separate written consent); it is processed through our redaction pipeline — designed to remove detected personal information — before any training use; turning Privacy Mode back on stops future training use and removes the workspace's data from any training dataset that has not yet been used in a completed training run; and models already trained cannot be reversed. Customer Data that Signals has not processed is not used for training. Self-hosted deployments and customer-controlled data planes are never used for training — we have no access to that data at all.

### B5. PII redaction at ingestion

Separately from training, customers on eligible plans can enable a per-project setting that runs incoming span inputs and outputs through a PII redaction model before storage, replacing detected personal information (names, emails, phone numbers, and similar) with placeholders. This filter is applied on a best-effort basis and is scoped to model input/output content; customers should not rely on it as their only safeguard and remain responsible for what their applications send.

### B6. Retention and deletion of Customer Data

- Customer Data is retained for as long as the customer's project exists. Plan-based retention windows (see our [pricing page](/pricing) for the current window per plan) limit how far back data is accessible in the product.
- When a customer deletes a project or workspace (or asks us to), the associated Customer Data is deleted from our primary databases. Copies in search indexes, caches, message queues, and backups are deleted or expire on a rolling basis afterward (search-index copies within at most 90 days).
- Where a workspace had opted into model training under B4, redacted data already incorporated into training datasets and trained models is not retroactively extracted by later deletion or by re-enabling Privacy Mode.

### B7. Self-hosted deployments

Laminar is open source and can be self-hosted. When you self-host, your data stays on your infrastructure: Laminar receives no Customer Data, this Part B does not apply, and no self-hosted data is ever used for training. Self-hosted deployments send us only an optional, anonymous usage heartbeat (deployment UUID, version, and row counts — no content and no IP address), which operators can disable.

## Updates to this notice

We may update this Privacy Notice from time to time. The "Last updated" date above shows the current revision, and we will notify you of material changes by posting a notice in the product or emailing you.

## Contact us

Privacy contact: [founders@lmnr.ai](mailto:founders@lmnr.ai)

LMNR AI, Inc.  
2261 Market Street, STE 10826  
San Francisco, CA 94114  
United States

To review, update, or delete personal data we hold about you, email [founders@lmnr.ai](mailto:founders@lmnr.ai).
