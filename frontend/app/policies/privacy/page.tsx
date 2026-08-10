// DRAFT — NOT REVIEWED BY COUNSEL. This document was prepared internally and
// must be reviewed and approved by outside counsel before publication.
//
// Items marked "NEEDS CONFIRMATION" in JSX comments below could not be fully
// verified from the codebase and must be confirmed by the founders/infra
// before this draft is finalized.
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Notice - Laminar",
  description: "How Laminar collects, uses, and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <div>
      <h1>Privacy Notice</h1>
      <p>
        <strong>Last updated August 10, 2026</strong>
      </p>
      <p>
        This Privacy Notice describes how LMNR AI, Inc. (doing business as Laminar) (&quot;<strong>Laminar</strong>
        ,&quot; &quot;<strong>we</strong>,&quot; &quot;<strong>us</strong>,&quot; or &quot;<strong>our</strong>&quot;)
        processes personal data in connection with our websites (including <a href="https://laminar.sh">laminar.sh</a>{" "}
        and <a href="https://lmnr.ai">lmnr.ai</a>) and our agent observability platform (together, the &quot;
        <strong>Services</strong>&quot;).
      </p>
      <p>It is organized in two parts, because we handle two very different kinds of data:</p>
      <ul>
        <li>
          <strong>Part A — Personal data for which Laminar is the controller.</strong> Data about you as an account
          holder, prospective customer, billing contact, or website visitor. We decide how and why this data is
          processed.
        </li>
        <li>
          <strong>Part B — Customer Data we process on behalf of our customers.</strong> The traces, model inputs and
          outputs, session recordings, evaluation records, and related content that customers send to the platform. For
          this data our customer is the controller (or the service provider of another controller) and Laminar is a
          processor acting on the customer&apos;s instructions under our{" "}
          <a href="mailto:founders@lmnr.ai">data processing agreement</a>.
        </li>
      </ul>
      <p>
        <strong>Questions?</strong> Contact us at <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>.
      </p>

      <h2>Part A — Personal data Laminar controls</h2>

      <h3>A1. What we collect</h3>
      <p>
        <strong>Account data.</strong> When you create an account we collect your email address, display name, and
        profile picture. If you sign in through an identity provider (GitHub, Google, Microsoft, Okta, or Keycloak), we
        receive this profile information from that provider — this is information collected from a third party. We also
        store authentication session records.
      </p>
      <p>
        <strong>Workspace and team data.</strong> Workspace names, membership and roles, and the email addresses of
        people you invite to your workspace.
      </p>
      <p>
        <strong>Billing data.</strong> If you purchase a paid plan, payment is handled by Stripe. We share your email
        address and workspace name with Stripe and store subscription state; we do not store your card number. See
        Stripe&apos;s privacy notice at <a href="https://stripe.com/privacy">stripe.com/privacy</a>.
      </p>
      <p>
        <strong>Usage and device data.</strong> We collect product analytics (pages viewed, features used) tied to your
        email address, and standard technical data such as IP address, browser, and device characteristics. Our
        analytics may include session replays of your interactions with our own application interface, with text inputs
        masked. We also collect error and performance diagnostics, which may include technical request metadata.
      </p>
      <p>
        <strong>Communications.</strong> Emails you exchange with us, feedback, and support requests. If you sign up, we
        may add your email address and name to our product-communications audience.
      </p>
      <p>
        <strong>Cookies.</strong> See our <a href="/policies/cookies">Cookie Policy</a>.
      </p>
      <p>
        In our capacity as a controller we do not intentionally collect sensitive categories of personal data (such as
        health, biometric, or racial or ethnic data), and we ask that you do not send them to us. Customer Data is
        different — see Part B.
      </p>

      <h3>A2. How and why we use it</h3>
      <ul>
        <li>To create and manage accounts and workspaces, and to authenticate you (performance of a contract).</li>
        <li>
          To provide, maintain, and secure the Services, and to prevent fraud and abuse (contract; legitimate
          interests).
        </li>
        <li>
          To bill for paid plans and send transactional email such as invoices, usage alerts, workspace invitations, and
          configured platform notifications (contract).
        </li>
        <li>To understand how the product is used and improve it (legitimate interests).</li>
        <li>
          To send product updates and marketing you can opt out of at any time (legitimate interests / consent where
          required).
        </li>
        <li>To comply with law and enforce our terms (legal obligation; legitimate interests).</li>
      </ul>
      <p>
        Where the GDPR or UK GDPR applies, the legal bases we rely on are shown in parentheses above. Where we rely on
        consent, you may withdraw it at any time. Note that this Part A does not cover model training on Customer Data,
        which is addressed in Part B.
      </p>

      <h3>A3. Who we share it with</h3>
      <p>
        We share personal data with service providers (subprocessors) that help us run the Services, under contracts
        that restrict their use of the data:
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
            <th>Data involved</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Stripe</td>
            <td>Payments and billing</td>
            <td>Email, workspace name, subscription state, payment details (held by Stripe)</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Transactional email delivery</td>
            <td>Email address and email content (invoices, alerts, invitations, reports)</td>
          </tr>
          <tr>
            <td>PostHog</td>
            <td>Product analytics</td>
            <td>Email, workspace name, product events, masked session replays, device data</td>
          </tr>
          <tr>
            <td>Sentry</td>
            <td>Error and performance monitoring</td>
            <td>Error reports and diagnostics, which may include request metadata</td>
          </tr>
          <tr>
            <td>Loops</td>
            <td>Product and marketing email audience</td>
            <td>Email, name, sign-up date</td>
          </tr>
          <tr>
            <td>Cloud infrastructure providers (including Amazon Web Services)</td>
            <td>Hosting and storage</td>
            <td>All data processed by the Services</td>
          </tr>
        </tbody>
      </table>
      {/* NEEDS CONFIRMATION: complete hosting stack for the cloud deployment
          (managed Postgres/ClickHouse vendors, CDN/DNS) is defined in infra
          outside this repo and must be confirmed before publishing a
          definitive subprocessor list. */}
      <p>We also disclose personal data:</p>
      <ul>
        <li>
          <strong>To integrations you connect.</strong> For example, if a workspace connects Slack, we send configured
          alerts, digests, and reports to that Slack workspace.
        </li>
        <li>
          <strong>To AI model providers.</strong> Certain optional features send the content you are working with to a
          third-party model provider to generate a response — see Part B.
        </li>
        <li>
          <strong>In business transfers.</strong> In connection with a merger, acquisition, financing, or sale of
          assets, subject to confidentiality obligations.
        </li>
        <li>
          <strong>For legal reasons.</strong> Where required by law or to protect rights, safety, and the integrity of
          the Services.
        </li>
      </ul>
      <p>We do not sell personal data.</p>

      <h3>A4. How long we keep it</h3>
      <ul>
        <li>
          Account and workspace data: for as long as your account exists, then deleted or anonymized within a reasonable
          period, except where law requires longer retention (for example tax and accounting records).
        </li>
        <li>Billing records: retained as required by tax and accounting law.</li>
        <li>Analytics and diagnostics: retained per our analytics providers&apos; configured retention.</li>
      </ul>
      {/* NEEDS CONFIRMATION: PostHog/Sentry project-level retention settings
          are configured in those vendors' dashboards, not in code. */}

      <h3>A5. Security</h3>
      <p>
        We use appropriate organizational and technical measures to protect personal data, including encryption in
        transit, encrypted storage of integration credentials and provider API keys, and role-based access to
        workspaces. No system is perfectly secure, and we cannot guarantee absolute security.
      </p>

      <h3>A6. Your rights</h3>
      <p>
        Depending on where you live, you may have rights to access, correct, delete, restrict, or port your personal
        data, to object to processing, and to withdraw consent. You can exercise these rights by emailing{" "}
        <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>. We will respond in accordance with applicable law. You
        may also lodge a complaint with your local data protection authority; in the EEA see{" "}
        <a href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm">
          your member state authority
        </a>
        , in the UK the <a href="https://ico.org.uk/make-a-complaint/">ICO</a>, and in Switzerland the{" "}
        <a href="https://www.edoeb.admin.ch/">FDPIC</a>.
      </p>
      <p>
        <strong>US state privacy rights.</strong> Residents of California, Delaware, and other states with comprehensive
        privacy laws may have the rights to know, access, correct, delete, and obtain a copy of personal data, the right
        to non-discrimination, and the right to opt out of targeted advertising, sale, or profiling. We do not sell
        personal data or use it for targeted advertising. In the categories used by California law, we collect:
        identifiers (name, email, IP address); commercial information (subscription history); and internet activity
        (product usage). We do not collect sensitive personal information as that term applies to our own collection;
        Customer Data processed on behalf of customers may contain personal information of any category, including
        sensitive personal information, as described in Part B — with respect to that data we act as a service provider.
        To exercise rights, or to appeal a decision, email <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>; if
        your appeal is denied you may contact your state attorney general.
      </p>
      <p>
        <strong>Do-Not-Track.</strong> There is no standard for DNT signals, and we do not respond to them at this time.
      </p>

      <h3>A7. Minors</h3>
      <p>
        The Services are not directed to children under 18 and we do not knowingly collect their data as a controller.
        If you believe a minor has provided us data, contact <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>.
      </p>

      <h2>Part B — Customer Data we process on behalf of customers</h2>

      <h3>B1. What Customer Data is</h3>
      <p>
        Customers use Laminar to observe and evaluate AI agents. To do this, their applications send us{" "}
        <strong>Customer Data</strong>, which includes:
      </p>
      <ul>
        <li>
          <strong>Traces and spans</strong> — records of what an agent did, including model inputs and outputs, prompts,
          tool calls and results, attributes, and metadata (which can include end-user identifiers the customer chooses
          to attach, such as a user ID or session ID);
        </li>
        <li>
          <strong>LLM message content</strong> — the conversation content exchanged with language models;
        </li>
        <li>
          <strong>Session recordings</strong> — browser-session replays a customer&apos;s application captures and
          uploads;
        </li>
        <li>
          <strong>Evaluation and dataset records</strong> — test inputs, outputs, and scores;
        </li>
        <li>
          <strong>Log records</strong> the customer&apos;s application emits; and
        </li>
        <li>
          <strong>Files and attachments</strong> referenced by traces (for example images), stored in object storage.
        </li>
      </ul>
      <p>
        <strong>Customer Data can contain anything the customer&apos;s application handles.</strong> If an end user
        tells a customer&apos;s agent about their health, finances, or anything else, that content arrives in the trace.
        It may therefore include personal data — including sensitive personal data — of the customer&apos;s end users.
        We do not receive this data from the end users themselves; we receive it from our customer, and we process it on
        the customer&apos;s documented instructions.
      </p>

      <h3>B2. Roles and end-user requests</h3>
      <p>
        For Customer Data, the customer is the controller (or a service provider to another controller) and Laminar is a
        processor / service provider under our data processing agreement. If you are an end user of a customer&apos;s
        application and want to exercise privacy rights over data in that customer&apos;s traces, please contact that
        customer — we will support them in responding, as our agreement with them requires. If you contact us directly
        we will refer your request to the relevant customer where we can identify them.
      </p>

      <h3>B3. What we do with Customer Data</h3>
      <p>We process Customer Data:</p>
      <ul>
        <li>to provide the platform — ingestion, storage, display, search, analytics, evaluations, and alerting;</li>
        <li>
          to run optional AI-assisted features the customer invokes or configures (for example failure detection, signal
          extraction, summarization, and AI-assisted queries). Some of these features send the relevant Customer Data to
          a third-party model provider (such as OpenAI, Google, or AWS Bedrock serving Anthropic models) to generate a
          response at the time of use. We do not permit these providers to train on Customer Data. Playground features
          that use the customer&apos;s own model API keys send data to the provider the customer selects;
        </li>
        <li>
          to improve Laminar&apos;s own models, <strong>only</strong> for workspaces that have turned Privacy Mode off —
          see B4; and
        </li>
        <li>to secure the Services, meter usage, and bill.</li>
      </ul>
      <p>
        Customer Data is stored with our cloud infrastructure providers listed in Part A. Configured alert and report
        content derived from Customer Data is delivered through our email provider and, where connected, to the
        customer&apos;s Slack workspace.
      </p>

      <h3>B4. Model training and Privacy Mode</h3>
      <p>
        Every workspace has a <strong>Privacy Mode</strong> setting, on by default. While Privacy Mode is on, we do not
        use that workspace&apos;s Customer Data to train or improve machine-learning models. If a workspace owner turns
        Privacy Mode off, we may use that workspace&apos;s trace data to train and improve Laminar&apos;s own models,
        subject to the commitments described on our <a href="/policies/data-use">Data Use page</a> and in our{" "}
        <a href="/policies/terms">Terms of Service</a>: Customer Data is processed through our redaction pipeline —
        designed to remove detected personal information — before any training use; turning Privacy Mode back on stops
        future training use prospectively; and models already trained cannot be reversed. Self-hosted deployments and
        customer-controlled data planes are never used for training — we have no access to that data at all.
      </p>

      <h3>B5. PII redaction at ingestion</h3>
      <p>
        Separately from training, customers on eligible plans can enable a per-project setting that runs incoming span
        inputs and outputs through a PII redaction model before storage, replacing detected personal information (names,
        emails, phone numbers, and similar) with placeholders. This filter is applied on a best-effort basis and is
        scoped to model input/output content; customers should not rely on it as their only safeguard and remain
        responsible for what their applications send.
      </p>

      <h3>B6. Retention and deletion of Customer Data</h3>
      <ul>
        <li>
          Customer Data is retained for as long as the customer&apos;s project exists. Plan-based retention windows (for
          example 7 days on Free, 30 days on Starter, 6 months on Pro) limit how far back data is accessible in the
          product.
        </li>
        <li>
          When a customer deletes a project or workspace (or asks us to), the associated Customer Data is deleted from
          our primary databases. Copies in search indexes, caches, message queues, and backups are deleted or expire on
          a rolling basis afterward (search-index copies within at most 90 days).
        </li>
        <li>
          Where a workspace had opted into model training under B4, redacted data already incorporated into training
          datasets and trained models is not retroactively extracted by later deletion or by re-enabling Privacy Mode.
        </li>
      </ul>
      {/* NEEDS CONFIRMATION: (1) object-storage payloads (S3) are not covered
          by the automated project purge today — access is revoked but blobs
          need a lifecycle/cleanup policy before we can promise full deletion;
          (2) plan retention windows are enforced at query time, not by
          physical deletion — if we want to promise deletion at window end,
          product work is required; (3) backup retention periods are set at
          the infra level. Confirm all three before finalizing. */}

      <h3>B7. Self-hosted deployments</h3>
      <p>
        Laminar is open source and can be self-hosted. When you self-host, your data stays on your infrastructure:
        Laminar receives no Customer Data, this Part B does not apply, and no self-hosted data is ever used for
        training. Self-hosted deployments send us only an optional, anonymous usage heartbeat (deployment UUID, version,
        and row counts — no content and no IP address), which operators can disable.
      </p>

      <h2>Updates to this notice</h2>
      <p>
        We may update this Privacy Notice from time to time. The &quot;Last updated&quot; date above shows the current
        revision, and we will notify you of material changes by posting a notice in the product or emailing you.
      </p>

      <h2>Contact us</h2>
      <p>
        Privacy contact: <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>
      </p>
      <p>
        LMNR AI, Inc.
        <br />
        2261 Market Street, STE 10826
        <br />
        San Francisco, CA 94114
        <br />
        United States
      </p>
      <p>
        To review, update, or delete personal data we hold about you, email{" "}
        <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>.
      </p>
    </div>
  );
}
