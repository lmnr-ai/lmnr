---
title: "Data Use"
description: "How Laminar uses Signal run data."
---

# Data Use

**Last updated August 11, 2026**

If you have any questions, email us at founders@lmnr.ai. For full detail on how we collect, use, and process personal data, see our [Privacy Notice](/policies/privacy).

Laminar fine-tunes the custom models that power [Signals](/docs/signals) on signal runs: when Signals analyzes your traces, the run produces a record of the content it examined and the results it generated. Whether your workspace's Signal runs are used for this depends on Privacy Mode setting:

- If Privacy Mode is on: we do not use your Signal runs to fine-tune our models. Your data is stored and processed only to run the product for you.

- If Privacy Mode is off: we may use your Signal runs to fine-tune the custom models behind Signals. Before any run reaches a training pipeline, it goes through our redaction filter, designed to strip names, emails, phone numbers, and other detected personal information. This redaction is mandatory on the training path, regardless of your project's ingestion settings.

Other notes:

- Privacy Mode defaults to off on Free and Starter plans and on for Pro and above. Customers that have signed a data processing agreement have privacy mode locked to on. Workspace owners can change it anytime in workspace settings, and it applies to the whole workspace. Details are in our [Terms of Service](/policies/terms).
- We don't train on anything else. Traces, session recordings, evaluations, and datasets outside of Signal runs are never used for fine-tuning. Workspaces that don't use Signals contribute nothing, whatever their setting.
- Turning Privacy Mode back on stops use of your Signal runs going forward, and we remove them from any training dataset not yet used in a completed run. Already-trained models can't be reversed.
- Only Signal runs generated on or after September 10, 2026 are ever used; anything older would require your separate consent.
- AI-assisted features send the relevant data to a model provider (Google Cloud or AWS Bedrock) to generate a response at the time of use; these providers do not retain or train on your data (see [Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance) and [AWS Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html) data policies).
- Self-hosted Laminar sends us nothing. On your own infrastructure or your own data plane, we have no access to your data and it's never used for fine-tuning.

See also our [Terms of Service](/policies/terms) and [Privacy Notice](/policies/privacy).