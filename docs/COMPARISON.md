# Comparison

Horizon Ledger is intentionally not a general knowledge base or a full ADR generator.

| Tool | Focus | Gap Horizon Ledger addresses |
| --- | --- | --- |
| ADR tools | Writing and organizing decisions | Usually static documents, weak evidence and agent access |
| Log4brains | Publishing ADRs | Good for publishing, not for querying by file or agent |
| Jira / Linear | Work tracking | Tracks tasks, not why a decision was chosen |
| PR descriptions | Context in commits | Hard to search, hard to connect across decisions |
| Slack / Notion | Team communication | Great for discussion, poor for durable, queryable memory |
| Agent memory stores (e.g. Agentpack) | Task continuity, portable task bundles | Rarely model reusable decisions with alternatives, scopes, and Git-native evidence |
| Local agent ledgers (e.g. Edda) | Session and coordination memory | Cross-repo decision query and evidence-aware provenance are still emerging |
| Multi-repo docs aggregators | Publishing documentation across repos | Aggregate prose, not evidence-aware decision graphs with provenance |

Horizon Ledger keeps the why in the repo, close to code, in a format that humans and agents can both read.
