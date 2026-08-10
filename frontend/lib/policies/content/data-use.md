---
title: "Data Use - Laminar"
description: "How Laminar uses the data you send us, depending on your Privacy Mode setting."
---

# How Laminar uses your data

**Last updated August 10, 2026**

This page explains, in plain language, what happens to the data your agents send to Laminar Cloud — traces, model inputs and outputs, session recordings, evaluations, and datasets. What we do with it depends on one setting: **Privacy Mode**, which every workspace owner controls in workspace settings.

## If Privacy Mode is on

We store your data and use it only to run the product for you: showing you your traces, powering search and analytics, running the features you invoke, billing, and keeping the service secure and reliable. **We never use it to train or improve our models.** Every workspace starts in Privacy Mode.

## If Privacy Mode is off

Everything above still applies, and in addition we may use your trace data to fine-tune our custom models that powers our Signals feature. Before any of your data reaches a training pipeline, it is run through our redaction filter, which is designed to strip names, emails, phone numbers, and other detected personal information.

## Notes

- **Only workspace owners** can change Privacy Mode, and it applies to all projects in the workspace.
- **Self-hosted Laminar sends us nothing.** If you run Laminar on your own infrastructure, or your data lives on your own data plane, we have no access to your data and it is never used for training, regardless of any setting.
- **Redaction on the training path is mandatory.** It runs even if you have not enabled PII redaction for ingestion in your project settings.
- **Turning Privacy Mode back on works going forward.** Your data stops being used for training from that moment. Models that were already trained cannot be reversed to remove the influence of data used earlier.
- **Third-party model providers.** Some features send the specific data you are working with to an external model provider (such as Google, or AWS Bedrock) to generate a response at the time you use the feature. We do not permit these providers to train on your data.

Questions? Contact us at [founders@lmnr.ai](mailto:founders@lmnr.ai). See also our [Privacy Notice](/policies/privacy) and [Terms of Service](/policies/terms).
