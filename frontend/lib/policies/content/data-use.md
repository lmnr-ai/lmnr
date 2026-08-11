---
title: "Data Use - Laminar"
description: "How Laminar uses the data you send us, depending on your Privacy Mode setting."
---

{/* DRAFT — NOT REVIEWED BY COUNSEL. This document was prepared internally and
must be reviewed and approved by outside counsel before publication. */}

# How Laminar uses your data

**Last updated August 10, 2026**

This page explains, in plain language, what happens to the data your agents send to Laminar Cloud — traces, model inputs and outputs, session recordings, evaluations, and datasets. What we do with it depends on one setting: **Privacy Mode**, which workspace owners control in workspace settings.

## If Privacy Mode is on

We store your data and use it only to run the product for you: showing you your traces, powering search and analytics, running the features you invoke, billing, and keeping the service secure and reliable. We do not use it to train or improve our models.

## If Privacy Mode is off

Everything above still applies, and in addition we train on Signal runs: when the Signals feature analyzes your traces, the content it examined and the results it produced may be used (after redaction) to improve the models behind Signals and the other AI-assisted features. Before any of that data reaches a training pipeline, it is run through our redaction filter, which is designed to strip names, emails, phone numbers, and other detected personal information. Only Signal run data generated on or after [EFFECTIVE_DATE] is used; using anything older would require your separate written consent.

Workspaces that do not use Signals contribute no training data, regardless of their Privacy Mode setting.

## Privacy Mode defaults

The default depends on your plan. You can change the setting at any time unless your account is covered by a signed data processing agreement (DPA), which locks Privacy Mode on.

| Plan | Privacy Mode default | Changeable |
| --- | --- | --- |
| Free / Hobby | Off (training allowed) | Yes |
| Pro and above | On | Yes |
| Signed DPA | On, enforced | No — locked |

**On Free and Hobby plans, Privacy Mode is off unless you turn it on.** Defaults only apply if you have never set the toggle yourself: an explicit choice sticks across plan changes, and changing plans never lowers your workspace's protection. These defaults take effect for existing workspaces on [EFFECTIVE_DATE], after the notice period.

## Notes

- **Only workspace owners** can change Privacy Mode, and it applies to all projects in the workspace.
- **Self-hosted Laminar sends us nothing.** If you run Laminar on your own infrastructure, or your data lives on your own data plane, we have no access to your data and it is never used for training, regardless of any setting.
- **Redaction on the training path is mandatory.** It runs even if you have not enabled PII redaction for ingestion in your project settings.
- **Turning Privacy Mode back on works going forward.** Your data stops being used for training from that moment, and we remove your workspace's data from any training dataset that has not yet been used in a completed training run. Models that were already trained cannot be reversed to remove the influence of data used earlier.
- **Third-party model providers.** Some features send the specific data you are working with to an external model provider (Google Cloud or AWS Bedrock) to generate a response at the time you use the feature. We do not permit these providers to train on your data.

Questions? Contact us at [founders@lmnr.ai](mailto:founders@lmnr.ai). See also our [Privacy Notice](/policies/privacy) and [Terms of Service](/policies/terms).
