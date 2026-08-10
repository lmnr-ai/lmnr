// DRAFT — NOT REVIEWED BY COUNSEL. This document was prepared internally and
// must be reviewed and approved by outside counsel before publication.
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Use - Laminar",
  description: "How Laminar uses the data you send us, depending on your Privacy Mode setting.",
};

export default function DataUsePage() {
  return (
    <div>
      <h1>How Laminar uses your data</h1>
      <p>
        <strong>Last updated August 10, 2026</strong>
      </p>
      <p>
        This page explains, in plain language, what happens to the data your agents send to Laminar Cloud — traces,
        model inputs and outputs, session recordings, evaluations, and datasets. What we do with it depends on one
        setting: <strong>Privacy Mode</strong>, which every workspace owner controls in workspace settings.
      </p>

      <h2>If Privacy Mode is on (the default)</h2>
      <p>
        We store your data and use it only to run the product for you: showing you your traces, powering search and
        analytics, running the features you invoke, billing, and keeping the service secure and reliable.{" "}
        <strong>We never use it to train or improve our models.</strong> Every workspace starts in Privacy Mode.
      </p>

      <h2>If Privacy Mode is off</h2>
      <p>
        Everything above still applies, and in addition we may use your trace data to train and improve Laminar&apos;s
        own models — the models behind features like failure detection, signal extraction, and summarization. Before any
        of your data reaches a training pipeline, it is run through our redaction filter, which is designed to strip
        names, emails, phone numbers, and other detected personal information.
      </p>

      <h2>Notes</h2>
      <ul>
        <li>
          <strong>Only workspace owners</strong> can change Privacy Mode, and it applies to the whole workspace.
        </li>
        <li>
          <strong>Self-hosted Laminar sends us nothing.</strong> If you run Laminar on your own infrastructure, or your
          data lives on your own data plane, we have no access to your data and it is never used for training,
          regardless of any setting.
        </li>
        <li>
          <strong>Redaction on the training path is mandatory.</strong> It runs even if you have not enabled PII
          redaction for ingestion in your project settings.
        </li>
        <li>
          <strong>Turning Privacy Mode back on works going forward.</strong> Your data stops being used for training
          from that moment. Models that were already trained cannot be reversed to remove the influence of data used
          earlier.
        </li>
        <li>
          <strong>Third-party model providers.</strong> Some features send the specific data you are working with to an
          external model provider (such as OpenAI, Anthropic, Google, or AWS Bedrock) to generate a response at the time
          you use the feature. We do not permit these providers to train on your data.
        </li>
      </ul>

      <p>
        Questions? Contact us at <a href="mailto:founders@lmnr.ai">founders@lmnr.ai</a>. See also our{" "}
        <a href="/policies/privacy">Privacy Notice</a> and <a href="/policies/terms">Terms of Service</a>.
      </p>
    </div>
  );
}
