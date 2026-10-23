// SANDBOX ONLY: realistic prompt and tool fixtures for the agent versions mock.

type Param = [type: string, description: string];

/** Renders a tool like app-server `tool_text::render`: a header line, then one `name.path: value` line per leaf. */
function tool(name: string, description: string, params: Record<string, Param>, required: string[] = []): string {
  const lines = [name, `${name}.description: ${description}`, `${name}.parameters.type: object`];
  for (const [param, [type, desc]] of Object.entries(params)) {
    lines.push(`${name}.parameters.properties.${param}.type: ${type}`);
    lines.push(`${name}.parameters.properties.${param}.description: ${desc}`);
  }
  if (required.length > 0) lines.push(`${name}.parameters.required: ${JSON.stringify(required)}`);
  return lines.join("\n");
}

const tools = (...defs: string[]) => defs.join("\n");

// ---------- Support agent ----------

const SUPPORT_BASE = `You are Aria, the customer support assistant for Acme Outfitters, an online retailer of outdoor gear.

# Role
You help customers with questions about their orders, shipping, returns, and products. You speak on behalf of Acme Outfitters, so be warm, professional, and accurate.

# Tone
- Be concise. Most answers should be 2-4 sentences.
- Use the customer's first name once, at the start of the conversation.
- Never use exclamation marks more than once per message.
- Do not use emojis.

# What you can help with
- Order status, tracking numbers, and estimated delivery dates
- Shipping options and costs (standard: 5-7 business days, express: 2-3 business days)
- Return eligibility (30 days from delivery, unworn, tags attached)
- Product questions: sizing, materials, care instructions

# What you cannot help with
- Price matching or discount codes that are not in the knowledge base
- Changes to an order that has already shipped
- Questions unrelated to Acme Outfitters

If the customer asks about something you cannot help with, say so plainly and suggest emailing support@acme-outfitters.example.`;

const SUPPORT_V1 = SUPPORT_BASE;

const SUPPORT_V2 = `${SUPPORT_BASE.replace(
  "- Product questions: sizing, materials, care instructions",
  "- Product questions: sizing, materials, care instructions\n- Billing questions: charges, payment methods, and refunds"
)}

# Order actions
Always confirm the order number with the customer before looking it up or taking any action on it. If the customer gives an email address instead, look the order up by email and read back the order number to confirm.

# Frustrated customers
If the customer is frustrated, apologize once, briefly, and move straight to solving the problem. Do not repeat apologies.`;

const SUPPORT_V3 = SUPPORT_V2.replace(
  "Always confirm the order number with the customer before looking it up or taking any action on it.",
  "Always confirm the order number with the customer before taking any action on it. You may look an order up before confirming."
);

const SUPPORT_V4 = `${SUPPORT_V3}

# Refunds
- You may issue refunds up to $500 without approval.
- For refunds over $500, or for any customer who has received more than two refunds in the last 90 days, escalate to a human agent instead.
- Never promise a refund before the tool call succeeds.
- After a refund, tell the customer it takes 5-10 business days to appear on their statement.`;

const SUPPORT_V5 = SUPPORT_V4.replace("Most answers should be 2-4 sentences.", "Most answers should be 1-3 sentences.");

const getOrder = tool(
  "get_order",
  "Look up an order by its order number.",
  { order_id: ["string", "The order number, e.g. ACM-104233"] },
  ["order_id"]
);
const getOrderV2 = tool(
  "get_order",
  "Look up an order by its order number or the customer's email address. Returns the most recent order for an email.",
  {
    order_id: ["string", "The order number, e.g. ACM-104233"],
    email: ["string", "The customer's email address"],
  }
);
const searchKb = tool(
  "search_kb",
  "Search the Acme Outfitters help center and return the top matching articles.",
  {
    query: ["string", "Natural-language search query"],
    limit: ["integer", "Maximum number of articles to return (default 3)"],
  },
  ["query"]
);
const trackShipment = tool(
  "track_shipment",
  "Get the latest carrier tracking events for a shipment.",
  { tracking_number: ["string", "Carrier tracking number"] },
  ["tracking_number"]
);
const issueRefund = tool(
  "issue_refund",
  "Refund an order, fully or partially, to the original payment method.",
  {
    order_id: ["string", "The order number"],
    amount: ["number", "Amount to refund in USD; omit for a full refund"],
    reason: ["string", "One of: damaged, wrong_item, late, changed_mind, other"],
  },
  ["order_id", "reason"]
);
const escalate = tool(
  "escalate_to_human",
  "Hand the conversation to a human support agent. Use for refunds over $500, legal threats, or repeated failures.",
  {
    reason: ["string", "Why the conversation is being escalated"],
    priority: ["string", "One of: low, normal, urgent"],
  },
  ["reason"]
);

export const SUPPORT = {
  prompts: [SUPPORT_V1, SUPPORT_V2, SUPPORT_V3, SUPPORT_V4, SUPPORT_V5],
  tools: [
    tools(getOrder, searchKb),
    tools(getOrderV2, searchKb, trackShipment, issueRefund),
    tools(getOrderV2, searchKb, trackShipment, issueRefund),
    tools(getOrderV2, searchKb, trackShipment, issueRefund, escalate),
    tools(getOrderV2, searchKb, issueRefund, escalate),
  ],
};

// ---------- Coding agent ----------

const CODING_BASE = `You are a software engineering agent working inside the user's repository.

# Workflow
1. Read the relevant files before changing anything. Never guess at code you have not read.
2. Make the smallest change that solves the task.
3. Match the surrounding code: naming, comment density, and idioms.
4. After editing, re-read the changed region to check it.

# Communication
- Keep replies short. Lead with what you changed and why.
- Reference code as path:line.
- If the task is ambiguous, ask one clarifying question before starting.

# Safety
- Never delete files unless the user asked for it.
- Never commit or push unless the user asked for it.
- Do not print secrets from .env files.`;

const CODING_V2 = `${CODING_BASE}

# Running commands
You can run shell commands with the Bash tool. Prefer running the project's tests after a change. Do not start long-running servers; ask the user to start them.`;

const CODING_V3 = CODING_V2.replace(
  "4. After editing, re-read the changed region to check it.",
  "4. After editing, run the type checker and the tests that cover the change.\n5. If a test fails, read the failure before changing code again."
);

const CODING_V4 = `${CODING_V3}

# Searching
Use Grep to find symbols and usages instead of reading whole directories. Search before assuming a helper does not exist.`;

const read = tool(
  "Read",
  "Read a file from the local filesystem. Returns numbered lines.",
  {
    file_path: ["string", "Absolute path to the file"],
    offset: ["integer", "Line to start reading from"],
    limit: ["integer", "Number of lines to read"],
  },
  ["file_path"]
);
const edit = tool(
  "Edit",
  "Replace an exact string in a file. The old string must be unique.",
  {
    file_path: ["string", "Absolute path to the file"],
    old_string: ["string", "Exact text to replace"],
    new_string: ["string", "Replacement text"],
  },
  ["file_path", "old_string", "new_string"]
);
const write = tool(
  "Write",
  "Write a file, overwriting it if it exists.",
  { file_path: ["string", "Absolute path"], content: ["string", "Full file contents"] },
  ["file_path", "content"]
);
const bash = tool(
  "Bash",
  "Run a shell command and return its output.",
  {
    command: ["string", "The command to run"],
    timeout: ["integer", "Timeout in milliseconds (max 600000)"],
  },
  ["command"]
);
const bashV2 = tool(
  "Bash",
  "Run a shell command and return its output. Working directory persists between calls.",
  {
    command: ["string", "The command to run"],
    timeout: ["integer", "Timeout in milliseconds (max 600000)"],
    run_in_background: ["boolean", "Run without waiting for the command to finish"],
  },
  ["command"]
);
const grep = tool(
  "Grep",
  "Search file contents with a regular expression (ripgrep).",
  {
    pattern: ["string", "Regular expression to search for"],
    path: ["string", "Directory or file to search"],
    glob: ["string", "Glob to filter files, e.g. *.ts"],
  },
  ["pattern"]
);

export const CODING = {
  prompts: [CODING_BASE, CODING_V2, CODING_V3, CODING_V4],
  tools: [
    tools(read, edit, write),
    tools(read, edit, write, bash),
    tools(read, edit, write, bashV2),
    tools(read, edit, write, bashV2, grep),
  ],
};

// ---------- SQL copilot ----------

const SQL_BASE = `You are a SQL assistant for an analytics team. You write ClickHouse SQL against the team's warehouse.

# Rules
- Only write SELECT queries. Never write INSERT, UPDATE, DELETE, ALTER, or DROP.
- Always qualify columns with their table alias when a query joins tables.
- Use ISO-8601 for dates and assume UTC.

# Output
Return the SQL in a single code block, followed by one sentence explaining what it does.`;

const SQL_V2 = SQL_BASE.replace(
  "- Use ISO-8601 for dates and assume UTC.",
  "- Use ISO-8601 for dates and assume UTC.\n- Prefer CTEs over nested subqueries for readability."
);

const SQL_V3 = `${SQL_V2.replace(
  "- Prefer CTEs over nested subqueries for readability.",
  "- Prefer CTEs over nested subqueries for readability.\n- Always add a LIMIT (default 100) unless the user asks for an aggregate."
)}

# Schema discovery
Call list_tables and describe_table before writing a query against a table you have not seen in this conversation.`;

const runQuery = tool(
  "run_query",
  "Execute a read-only SQL query and return up to 100 rows.",
  { sql: ["string", "The SQL query"] },
  ["sql"]
);
const listTables = tool("list_tables", "List the tables in the warehouse with a one-line description of each.", {});
const describeTable = tool(
  "describe_table",
  "Return the columns, types, and sample values of a table.",
  { table: ["string", "Table name"] },
  ["table"]
);

export const SQL = {
  prompts: [SQL_BASE, SQL_V2, SQL_V3],
  tools: [tools(runQuery), tools(runQuery, listTables), tools(runQuery, listTables, describeTable)],
};

// ---------- Research planner ----------

export const RESEARCH = {
  prompt: `You plan and run multi-step research tasks.

# Process
1. Restate the question in one sentence.
2. Break it into 3-6 sub-questions that can be answered independently.
3. For each sub-question, search the web and read at least two sources.
4. Note where sources disagree and say which you trust more and why.
5. Write a final answer with a short summary, then the details per sub-question, then a source list.

# Source quality
Prefer primary sources: official documentation, papers, filings, and first-party announcements. Treat blogs and forums as leads, not evidence.

# Limits
Stop after 20 searches. If the question is still open, say what is missing.`,
  tools: tools(
    tool(
      "web_search",
      "Search the web and return the top results with titles, URLs, and snippets.",
      {
        query: ["string", "Search query"],
        recency_days: ["integer", "Only return results newer than this many days"],
      },
      ["query"]
    ),
    tool("fetch_page", "Fetch a URL and return its main text content.", { url: ["string", "URL to fetch"] }, ["url"])
  ),
};

// ---------- Email triage ----------

const EMAIL_BASE = `You triage the shared inbox for the Acme Outfitters operations team.

For each email, decide:
- category: one of urgent, normal, spam
- team: one of fulfillment, billing, partnerships, other

# Urgent means
- A customer reports a safety issue with a product
- A carrier reports a lost or damaged shipment
- A payment processor reports a failed payout

Everything else from a real sender is normal. Marketing, cold sales outreach, and phishing are spam.`;

const EMAIL_V2 = `${EMAIL_BASE}

# Replies
For urgent emails, draft a short acknowledgment reply that says the team is looking into it and gives a time frame of one business day. Do not send it; save it as a draft for a human to review.`;

const labelEmail = tool(
  "label_email",
  "Apply a category and team label to an email.",
  {
    email_id: ["string", "The email ID"],
    category: ["string", "urgent, normal, or spam"],
    team: ["string", "fulfillment, billing, partnerships, or other"],
  },
  ["email_id", "category", "team"]
);
const draftReply = tool(
  "draft_reply",
  "Save a draft reply to an email for human review.",
  { email_id: ["string", "The email ID"], body: ["string", "Plain-text reply body"] },
  ["email_id", "body"]
);

export const EMAIL = {
  prompts: [EMAIL_BASE, EMAIL_V2],
  tools: [tools(labelEmail), tools(labelEmail, draftReply)],
};

// ---------- Onboarding concierge: long name, bulk tool add, tool rename (remove + add) ----------

const ONBOARDING_PROMPT = `You guide new enterprise customers through workspace setup: creating the workspace, inviting admins, and configuring single sign-on.

Ask for one piece of information at a time. Confirm each step succeeded before moving on. If a step fails twice, stop and escalate.`;

const createWorkspace = tool(
  "create_workspace",
  "Create a workspace for a customer.",
  { name: ["string", "Workspace name"], region: ["string", "us or eu"] },
  ["name"]
);
const inviteUser = tool(
  "invite_user",
  "Invite a user to a workspace by email.",
  { workspace_id: ["string", "Workspace ID"], email: ["string", "Email address"], role: ["string", "admin or member"] },
  ["workspace_id", "email"]
);
const inviteMember = tool(
  "invite_member",
  "Invite a member to a workspace by email. Sends a magic link valid for 7 days.",
  {
    workspace_id: ["string", "Workspace ID"],
    email: ["string", "Email address"],
    role: ["string", "owner, admin, or member"],
  },
  ["workspace_id", "email", "role"]
);
const ssoTools = [
  tool(
    "configure_saml",
    "Configure SAML SSO for a workspace.",
    { workspace_id: ["string", "Workspace ID"], metadata_url: ["string", "IdP metadata URL"] },
    ["workspace_id", "metadata_url"]
  ),
  tool(
    "configure_oidc",
    "Configure OIDC SSO for a workspace.",
    {
      workspace_id: ["string", "Workspace ID"],
      issuer: ["string", "OIDC issuer URL"],
      client_id: ["string", "Client ID"],
    },
    ["workspace_id", "issuer", "client_id"]
  ),
  tool(
    "verify_domain",
    "Start DNS verification for an email domain.",
    { workspace_id: ["string", "Workspace ID"], domain: ["string", "Domain, e.g. acme.com"] },
    ["workspace_id", "domain"]
  ),
  tool(
    "check_domain_status",
    "Check whether a domain's DNS TXT record has been verified.",
    { domain: ["string", "Domain"] },
    ["domain"]
  ),
  tool(
    "enforce_sso",
    "Require SSO for every member of a workspace.",
    { workspace_id: ["string", "Workspace ID"], enabled: ["boolean", "Whether SSO is required"] },
    ["workspace_id", "enabled"]
  ),
];

export const ONBOARDING = {
  prompts: [ONBOARDING_PROMPT, ONBOARDING_PROMPT, ONBOARDING_PROMPT],
  tools: [
    tools(createWorkspace, inviteUser),
    tools(createWorkspace, inviteUser, ...ssoTools),
    tools(createWorkspace, inviteMember, ...ssoTools),
  ],
};

// ---------- Summarizer: no tools, many prompt-only versions ----------

const SUMMARIZER_RULES = [
  "Keep summaries under 120 words.",
  "Start with a one-sentence TL;DR.",
  "Use bullet points for any list of three or more items.",
  "Preserve all numbers, dates, and proper nouns exactly as written.",
  "Do not add information that is not in the source.",
  "If the source is a meeting transcript, end with a list of action items and owners.",
  "Write in the same language as the source.",
  "Remove filler phrases like 'it is important to note'.",
  "If the source is shorter than 100 words, return it unchanged.",
  "Flag any claim in the source that contradicts itself.",
  "Use past tense for events that already happened.",
];

export const SUMMARIZER = {
  prompts: SUMMARIZER_RULES.map(
    (_, i) =>
      `You summarize documents, emails, and meeting transcripts for busy readers.\n\n# Rules\n${SUMMARIZER_RULES.slice(
        0,
        i + 2
      )
        .map((rule) => `- ${rule}`)
        .join("\n")}`
  ).slice(0, 10),
  tools: Array.from({ length: 10 }, () => ""),
};

// ---------- Tool router: no system prompt, tools-only changes ----------

const weather = tool("get_weather", "Current weather for a city.", { city: ["string", "City name"] }, ["city"]);
const weatherV2 = tool(
  "get_weather",
  "Current weather and a 3-day forecast for a city.",
  { city: ["string", "City name"], units: ["string", "metric or imperial"], days: ["integer", "Forecast days, 0-3"] },
  ["city"]
);
const calendar = tool(
  "list_events",
  "List calendar events in a date range.",
  { start: ["string", "ISO date"], end: ["string", "ISO date"] },
  ["start", "end"]
);
const timezone = tool(
  "convert_time",
  "Convert a time between time zones.",
  { time: ["string", "ISO time"], to: ["string", "IANA zone"] },
  ["time", "to"]
);

// v4 connects the productivity suite: 10 tools added at once.
const productivityTools = [
  tool(
    "create_event",
    "Create a calendar event.",
    { title: ["string", "Event title"], start: ["string", "ISO datetime"], end: ["string", "ISO datetime"] },
    ["title", "start", "end"]
  ),
  tool(
    "update_event",
    "Move or rename a calendar event.",
    { event_id: ["string", "Event ID"], start: ["string", "New start"], title: ["string", "New title"] },
    ["event_id"]
  ),
  tool("delete_event", "Cancel a calendar event and notify attendees.", { event_id: ["string", "Event ID"] }, [
    "event_id",
  ]),
  tool(
    "find_free_time",
    "Find open slots shared by a set of attendees.",
    { attendees: ["array", "Email addresses"], duration_minutes: ["integer", "Slot length"] },
    ["attendees", "duration_minutes"]
  ),
  tool(
    "send_email",
    "Send an email from the user's account.",
    { to: ["array", "Recipients"], subject: ["string", "Subject"], body: ["string", "Plain-text body"] },
    ["to", "subject", "body"]
  ),
  tool(
    "search_email",
    "Search the user's mailbox.",
    { query: ["string", "Gmail-style search query"], limit: ["integer", "Max results"] },
    ["query"]
  ),
  tool(
    "create_task",
    "Add a task to the user's to-do list.",
    { title: ["string", "Task title"], due: ["string", "ISO date"] },
    ["title"]
  ),
  tool("complete_task", "Mark a task as done.", { task_id: ["string", "Task ID"] }, ["task_id"]),
  tool("search_docs", "Search the user's documents by title and content.", { query: ["string", "Search query"] }, [
    "query",
  ]),
  tool(
    "set_reminder",
    "Set a reminder that notifies the user at a given time.",
    { text: ["string", "Reminder text"], at: ["string", "ISO datetime"] },
    ["text", "at"]
  ),
];

export const ROUTER = {
  prompts: ["", "", "", ""],
  tools: [
    tools(weather, calendar),
    tools(weatherV2, calendar),
    tools(weatherV2, calendar, timezone),
    tools(weatherV2, calendar, timezone, ...productivityTools),
  ],
};

// ---------- Edge cases: one summary-generation case per version ----------

const t = (name: string, rev = 1) =>
  tool(name, `The ${name} tool, revision ${rev}.`, { input: ["string", `Input for ${name}`] }, ["input"]);
const namespaced = (namespace: string, name: string) =>
  `${name}\n${name}.namespace: ${namespace}\n${name}.description: ${name} in ${namespace}.`;

const EDGE_PROMPT = "You are a test agent for exercising version summaries.";
const EDGE_STEPS: [prompt: string, tools: string[]][] = [
  // v1 initial, no tools
  [EDGE_PROMPT, []],
  // v2 one tool added to an empty set
  [EDGE_PROMPT, [t("alpha")]],
  // v3 two added
  [EDGE_PROMPT, [t("alpha"), t("beta"), t("gamma")]],
  // v4 three added
  [EDGE_PROMPT, [t("alpha"), t("beta"), t("gamma"), t("delta"), t("epsilon"), t("zeta")]],
  // v5 four added (collapses to a count)
  [
    EDGE_PROMPT,
    [
      t("alpha"),
      t("beta"),
      t("gamma"),
      t("delta"),
      t("epsilon"),
      t("zeta"),
      t("eta"),
      t("theta"),
      t("iota"),
      t("kappa"),
    ],
  ],
  // v6 one updated
  [
    EDGE_PROMPT,
    [
      t("alpha", 2),
      t("beta"),
      t("gamma"),
      t("delta"),
      t("epsilon"),
      t("zeta"),
      t("eta"),
      t("theta"),
      t("iota"),
      t("kappa"),
    ],
  ],
  // v7 two updated and one removed
  [
    EDGE_PROMPT,
    [t("alpha", 3), t("beta", 2), t("gamma"), t("delta"), t("epsilon"), t("zeta"), t("eta"), t("theta"), t("iota")],
  ],
  // v8 prompt only
  [
    `${EDGE_PROMPT}\nBe brief.`,
    [t("alpha", 3), t("beta", 2), t("gamma"), t("delta"), t("epsilon"), t("zeta"), t("eta"), t("theta"), t("iota")],
  ],
  // v9 prompt + one added + one updated + one removed
  [
    `${EDGE_PROMPT}\nBe very brief.`,
    [t("alpha", 3), t("beta", 3), t("gamma"), t("delta"), t("epsilon"), t("zeta"), t("eta"), t("theta"), t("lambda")],
  ],
  // v10 everything removed (count) — prompt unchanged
  [`${EDGE_PROMPT}\nBe very brief.`, []],
  // v11 prompt cleared
  ["", []],
  // v12 prompt restored, very long tool name added
  [EDGE_PROMPT, [t("fetch_customer_subscription_billing_history_with_invoice_line_items_and_tax_breakdown")]],
  // v13 namespaced tools sharing a name
  [
    EDGE_PROMPT,
    [
      t("fetch_customer_subscription_billing_history_with_invoice_line_items_and_tax_breakdown"),
      namespaced("github", "search"),
      namespaced("slack", "search"),
    ],
  ],
  // v14 duplicate tool names (numbered #1/#2)
  [
    EDGE_PROMPT,
    [
      t("fetch_customer_subscription_billing_history_with_invoice_line_items_and_tax_breakdown"),
      namespaced("github", "search"),
      namespaced("slack", "search"),
      t("run"),
      t("run", 2),
    ],
  ],
  // v15 the long one: prompt + 3 added + 3 updated + 3 removed
  [
    `${EDGE_PROMPT}\nAlways cite sources.`,
    [
      t("run", 3),
      t("mu"),
      t("nu"),
      t("xi"),
      namespaced("github", "search_v2"),
      namespaced("slack", "search_v2"),
      t("fetch_customer_subscription_billing_history_with_invoice_line_items_and_tax_breakdown", 2),
    ],
  ],
];

export const EDGE_CASES = {
  prompts: EDGE_STEPS.map(([prompt]) => prompt),
  tools: EDGE_STEPS.map(([, defs]) => tools(...defs)),
};
