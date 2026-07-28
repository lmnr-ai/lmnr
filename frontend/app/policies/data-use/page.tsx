/**
 * UNREVIEWED COUNSEL DRAFT — NOT LEGAL ADVICE, NOT CLEARED FOR PUBLICATION.
 *
 * Plain-English summary of the training / Privacy Mode position (LAM-2028).
 * Deliberately uses no defined terms — the operative wording lives in
 * /policies/privacy Part B and the DPA. Keep this page to roughly one screen.
 */
import { type Metadata } from "next";

import { withBasePath } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Data use - Laminar",
  description: "What Laminar does and does not do with the trace data you send us.",
};

const LAST_UPDATED = "July 28, 2026";

export default function DataUsePage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1>Data use</h1>
      <div>
        <strong>Last updated {LAST_UPDATED}</strong>
      </div>

      <p>
        This page explains, in plain English, what we do with the trace data your application sends to Laminar. One
        setting decides it: <strong>Privacy Mode</strong>, in your workspace settings. It is <strong>on</strong> when
        you create a workspace.
      </p>

      <h2>Privacy Mode on (the default)</h2>

      <ul>
        <li>We store your traces so you can search and read them, and we show them back to you.</li>
        <li>
          <strong>We never train our models on your data.</strong> None of it goes into a training set.
        </li>
        <li>
          We use it to run the product for you — searching, evaluations, alerts, and any AI feature you press the button
          on.
        </li>
        <li>Our staff look at it only to fix a problem you have reported or to investigate an incident.</li>
        <li>
          You can delete a project, and we delete its traces, messages, recordings and evaluation data. A few things
          take longer or need us to do them by hand — see the note on deletion below.
        </li>
      </ul>

      <h2>Privacy Mode off</h2>

      <p>Everything above still applies, and in addition:</p>

      <ul>
        <li>
          <strong>We may use your traces to train and improve our own models</strong> — the models that make Laminar
          better at reading agent traces.
        </li>
        <li>
          Your data is <strong>redacted before it enters any training set</strong>, whether or not you have turned on
          redaction for your traces. See the note below on what redaction catches.
        </li>
        <li>We do not sell your data, and we do not let other companies train their models on it.</li>
      </ul>

      <p>
        Only a workspace owner can turn Privacy Mode off, and it applies to that whole workspace. If you are not sure,
        leave it on.
      </p>

      <h2>Notes worth reading before you decide</h2>

      <ul>
        <li>
          <strong>Self-hosting and your own data plane are always excluded.</strong> If you run Laminar yourself, we
          never see your traces. If your traces stay in your own data plane, they are never part of a training set, no
          matter what Privacy Mode says.
        </li>
        <li>
          <strong>Redaction on the training path is not optional.</strong> Data is redacted before training even if you
          have redaction switched off for your own traces. Redaction is automatic detection of things like names and
          email addresses. It is good, not perfect: it works on text values, misses some things, and does not reach
          every field we store — session recordings, span attributes, and evaluation data among them. If something must
          never reach us, filter it out in your own code before you send it.
        </li>
        <li>
          <strong>Turning Privacy Mode back on only affects what happens next.</strong> It stops us using your data for
          training from that point on. It does not pull your data out of a training set it is already in, and it{" "}
          <strong>cannot undo the training of a model that has already learned from it.</strong> Model weights cannot be
          reversed. The same applies if you delete data after training has happened.
        </li>
        <li>
          <strong>AI features send data to model providers at the moment you use them.</strong> That is how they work,
          and it happens whatever Privacy Mode is set to. Those providers are contractually barred from training on what
          we send them. If you plug in your own provider key, that request goes to your provider under your own account
          and terms.
        </li>
        <li>
          <strong>Storing is not the same as keeping forever, and retention windows are not deletion.</strong> Your plan
          has a retention window that limits how far back you can query. Data older than that stays in storage until it
          is deleted. If you want it gone, delete the project or ask us.
        </li>
        <li>
          <strong>Deleting a project does not yet reach everything.</strong> It deletes the traces, messages, session
          recordings and evaluation data. It does not currently remove the search-index entries for that project — those
          age out on their own within 90 days — and it does not remove file attachments or dataset exports from our
          object storage. Deleting a single trace is narrower still: it removes the span records, but the trace summary
          row and the shared message bodies stay. If you need something specific fully gone, email us and we will do it
          properly rather than relying on the in-product delete.
        </li>
      </ul>

      <h2>Changing your mind</h2>

      <p>
        Privacy Mode lives in workspace settings and takes effect immediately. If you want us to confirm in writing what
        we hold or to delete something specific, email <a href="mailto:privacy@lmnr.ai">privacy@lmnr.ai</a>.
      </p>

      <p>
        This page is a summary. The full detail is in our <a href={withBasePath("/policies/privacy")}>Privacy Notice</a>{" "}
        (Part B covers customer data) and our <a href={withBasePath("/policies/terms")}>Terms of Service</a>. If you
        have a Data Processing Addendum with us, it governs.
      </p>
    </div>
  );
}
