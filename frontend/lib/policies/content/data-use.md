---
title: "Data Use"
description: "How Laminar uses Signal run data for model training and creates anonymous, aggregated statistics."
---

# Data Use

**Last updated October 19, 2026**

If you have any questions, email us at founders@lmnr.ai. For full detail on how we collect, use, and process personal data, see our [Privacy Notice](/policies/privacy).

Beyond running the product for you, there are two things we may do with the data your agents send us: fine-tune the models behind Signals, and publish anonymous, aggregated statistics about how AI agents behave. Both are described below.

## Model training

Laminar fine-tunes the custom models that power [Signals](/docs/signals) on signal runs: when Signals analyzes your traces, the run produces a record of the content it examined and the results it generated. Whether your workspace's Signal runs are used for this depends on Privacy Mode setting:

- If Privacy Mode is on: we do not use your Signal runs to fine-tune our models. Your data is stored and processed only to run the product for you.

- If Privacy Mode is off: we may use your Signal runs to fine-tune the custom models behind Signals. Before any run reaches a training pipeline, it goes through our redaction filter, designed to strip names, emails, phone numbers, and other detected personal information. This redaction is mandatory on the training path, regardless of your project's ingestion settings.

Other notes:

- Privacy Mode defaults to off on Free and Starter plans and on for Pro and above. Customers that have signed a data processing agreement have privacy mode locked to on. Workspace owners can change it anytime in workspace settings, and it applies to the whole workspace. Details are in our [Terms of Service](/policies/terms).
- We don't train on anything else. Traces, session recordings, evaluations, and datasets outside of Signal runs are never used for fine-tuning. Workspaces that don't use Signals contribute nothing, whatever their setting.
- Turning Privacy Mode back on stops use of your Signal runs going forward, and we remove them from any training dataset not yet used in a completed run. Already-trained models can't be reversed.
- Only Signal runs generated on or after September 10, 2026 are ever used; anything older would require your separate consent.

## Aggregated statistics

Starting November 20, 2026, we create anonymous statistics across all Laminar-hosted workspaces and may publish them in blog posts, reports, and public dashboards. Think "which kinds of mistakes do agents make most often, by model, by harness, and by type of agent." A published chart might say that, for a given model, a certain percentage of agent failures were fabricated facts, ignored instructions (such as output format or length limits), malformed tool calls, or looping and redundant work.

To do this, automated analysis tags traces with a few broad labels: the failure category, the model, the harness, and the type of agent. Only those labels go into the statistics; your trace content never does.

What we will never publish:

- Excerpts from your traces, word for word or paraphrased.
- Your name, your workspace, your end users, or any number tied to you.
- A model, harness, or agent type specific enough to point to you. A breakdown is only published when it covers at least five unrelated workspaces; anything smaller goes into "other," and private or fine-tuned model names never appear.
- Absolute volumes, such as how many traces, requests, or tokens any model or harness handles. We only publish percentages and rankings.
- Anything that hints at how a particular agent is built or run, such as time of day, location, or prompting style.

Other notes:

- This is not model training, so Privacy Mode doesn't change it. Customers with a signed data processing agreement are covered by that agreement.
- Only data generated on or after November 20, 2026 is used.
- We won't try to re-identify anyone from these statistics, and neither may anyone we share them with.
- Self-hosted Laminar and customer-controlled data planes are never included.

## Everything else

- AI-assisted features send the relevant data to a model provider (Google Cloud or AWS Bedrock) to generate a response at the time of use; these providers do not retain or train on your data (see [Google Cloud](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance) and [AWS Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html) data policies).
- Self-hosted Laminar sends us nothing. On your own infrastructure or your own data plane, we have no access to your data and it's never used for fine-tuning or statistics.

See also our [Terms of Service](/policies/terms) and [Privacy Notice](/policies/privacy).
