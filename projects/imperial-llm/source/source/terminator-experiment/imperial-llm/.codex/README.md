# ECC-inspired project swarm

Adapted from https://github.com/affaan-m/ECC/tree/76aaa77df6adc5b889e689007bf99b9a4f74af34/.codex : explorer before changes, independent reviewer, source verification and bounded role ownership.

ECC's role-layer config is an older format. This implementation uses current standalone files with name, description and developer_instructions, following https://learn.chatgpt.com/docs/agent-configuration/subagents (checked 2026-10-19). No model overrides, sandbox changes, hooks, MCP installation or global configuration changes. The project sets three concurrent spawned workers; managed session limits still take precedence.

Open this repository as a trusted project in a compatible Codex release to discover the six profiles. Example request: “Have general-soult inspect the data split, general-davout implement the smallest verified improvement, and general-lannes review it. Have general-ney apply DESIGN.md, then general-massena package the verified release.” The coordinator runs role passes in waves; config files do not start agents by themselves.

Reference repositories were inspected as source material, not executed or installed as trusted global instructions. The project-specific role wording is original.
