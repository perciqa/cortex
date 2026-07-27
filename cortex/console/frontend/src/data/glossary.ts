export const GLOSSARY = {
  finding: {
    term: "Finding",
    plain: "A single observed behaviour or artefact — one concrete thing the fabric saw.",
    eg: 'e.g. "PowerShell remoting used to pivot within 4 hours."',
  },
  insight: {
    term: "Insight",
    plain: "An LLM-synthesised conclusion drawn across one or more findings. It connects the dots; a finding is a dot.",
  },
  trust: {
    term: "Trust",
    plain: 'How corroborated this item is. 0 / "unranked" means nothing has confirmed or denied it yet — not that it is wrong.',
  },
  unranked: {
    term: "Unranked",
    plain: 'No corroboration signal yet. Treat as "open question", not "low priority".',
  },
  actor: {
    term: "Actor",
    plain: "The threat group attributed to this activity (e.g. APT29, Turla, REvil).",
  },
  technique: {
    term: "Technique",
    plain: "A MITRE ATT&CK code — a named tactic adversaries use. Hover any T-code to read it.",
    eg: "T1059.001 = PowerShell execution.",
  },
  payload: {
    term: "Tool payload",
    plain: 'The raw input the LLM agent was handed. Engineers only — the friendly "Sources" view above is the same data, translated.',
  },
  provenance: {
    term: "Provenance",
    plain: "The chain of articles and events that led to this item. Think of it as a citation tree — who said what, and what they based it on.",
  },
  severity: {
    term: "Severity",
    plain: "How critical this item is, based on the MITRE ATT&CK severity rating and available trust signals.",
  },
  agent: {
    term: "Agent",
    plain: "An automated reasoning process running in the fabric. Each agent monitors a scope, analyses findings, and publishes insights.",
  },
  computation_ref: {
    term: "ZK-Verified",
    plain: "This computation was cryptographically verified using a zero-knowledge proof. The result is provably correct without revealing the inputs.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
