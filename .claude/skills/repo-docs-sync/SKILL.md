---
name: repo-docs-sync
description: >-
  Audits and synchronizes all technical documentation in a repository.
  Use when the user asks to update documentation, sync docs with the
  codebase, review if docs are outdated, or ensure AI agent rules match
  the current project state. Triggers on: "update docs", "sync documentation",
  "review documentation", "atualize a documentação", "sincronize os docs",
  "review the README", "update AGENTS.md", "update CLAUDE.md", "docs are
  outdated", "atualizar documentação do repositório".
  Do NOT trigger for: writing new feature code, debugging, or running tests.
---

# Repo Docs Sync

Audits and synchronizes all technical documentation in a repository to ensure
that AI agent instructions, developer docs, and README accurately reflect the
current state of the codebase. Prevents AI hallucination, stale rules, and
developer confusion by detecting drift between code and documentation.

> [!CAUTION]
> **This skill is READ-FIRST, WRITE-SECOND.** Never update a documentation
> file without first reading the ACTUAL source code it references. Never
> assume a pattern exists — open the real file and confirm.

---

## When to Use

- User says "atualize/sincronize a documentação" or equivalent
- After a significant feature was merged and docs may be stale
- Periodically as a hygiene check
- When onboarding a new repository that has no documentation structure
- When the user wants to ensure AI agents won't hallucinate

---

## Phase 1: Discovery — Map the Documentation Landscape

### 1.1 Identify ALL Documentation Touchpoints

Search the repository root for every documentation file and directory that
exists or should exist. Check ALL of these locations:

```
MANDATORY SCAN TARGETS:
├── README.md                    # Developer-facing project overview
├── AGENTS.md                    # OpenAI Codex / generic AI agent rules
├── CLAUDE.md                    # Claude Code (Anthropic) rules
├── COPILOT.md                   # GitHub Copilot instructions (if exists)
├── .cursorrules                 # Cursor AI rules (if exists)
├── .agents/                     # Antigravity (Google) agent config
│   ├── rules/*.md               # Workspace rules
│   └── workflows/*.md           # Actionable workflows (bugfix, feature, etc.)
├── docs/                        # Domain-specific long-form documentation
│   └── **/*.md                  # All markdown files recursively
├── .github/
│   ├── CONTRIBUTING.md          # Contribution guidelines (if exists)
│   └── copilot-instructions.md  # GitHub Copilot context (if exists)
└── package.json                 # Scripts, dependencies (for cross-reference)
```

> [!IMPORTANT]
> **Skip auto-generated / tool-cache doc mirrors.** Some tools keep synced
> copies of AGENTS.md / CLAUDE.md under their own dirs (e.g. `.maestri/roles/*/`,
> `.cursor/`, vendored snapshots). NEVER hand-edit those — they are regenerated
> from the root source-of-truth files. Editing them creates drift. Only edit the
> canonical root files; let the tool re-sync its mirror.

**Commands to run:**

```bash
# Find all markdown documentation files (excluding generated mirrors)
find . -name '*.md' -not -path './node_modules/*' -not -path './.next/*' \
  -not -path './dist/*' -not -path './.maestri/*' -not -path './.git/*' | sort

# Find agent-specific config files
find . -name '.cursorrules' -o -name 'COPILOT.md' -o -name 'copilot-instructions.md' 2>/dev/null

# Check if .agents directory exists
ls -la .agents/ 2>/dev/null

# Check docs directory structure
find docs/ -name '*.md' 2>/dev/null | sort
```

### 1.2 Read Every Documentation File

Read EVERY documentation file found in 1.1. For each file, record:

- **Path**: absolute path
- **Purpose**: what the file documents
- **Line count**: current size
- **Last meaningful topic**: the last domain/feature mentioned
- **Key terms referenced**: list of technical terms, file paths, and function names

### 1.3 Build the Documentation Registry

Create a mental map (or artifact) with this structure:

| Layer | File | Purpose | Status |
|-------|------|---------|--------|
| Root | README.md | Developer overview | ✅ exists / ❌ missing |
| AI Agent | AGENTS.md | Codex rules | ✅ / ❌ |
| AI Agent | CLAUDE.md | Claude Code rules | ✅ / ❌ |
| AI Agent | .agents/rules/*.md | Antigravity rules | ✅ / ❌ |
| AI Agent | .agents/workflows/*.md | Antigravity workflows | ✅ / ❌ |
| Domain | docs/**/*.md | Deep domain docs | ✅ / ❌ |

---

## Phase 2: Code Archaeology — Analyze Recent Changes

### 2.1 Analyze the Last N Commits

Analyze the last **50 commits** (or 30 if the repo is very active) to identify
what changed in the codebase since the documentation was last updated.

> [!TIP]
> If the sync is happening BEFORE a big commit (many staged/unstaged files not
> yet committed), analyze the WORKING TREE too, not just history:
> `git status --short` and `git diff --stat HEAD`. Uncommitted changes are the
> most likely source of doc drift in that scenario.

```bash
# Get last 50 commits with files changed
git log --oneline --name-only -n 50

# Get summary of changes per file (additions/deletions)
git log --oneline --stat -n 50

# Get list of unique files changed in last 50 commits
git log --name-only --pretty=format: -n 50 | sort -u | grep -v '^$'

# Find new files created in last 50 commits
git log --diff-filter=A --name-only --pretty=format: -n 50 | sort -u | grep -v '^$'

# Find deleted files in last 50 commits
git log --diff-filter=D --name-only --pretty=format: -n 50 | sort -u | grep -v '^$'

# Pre-commit sweep: everything not yet committed
git status --short
git diff --stat HEAD
```

### 2.2 Classify Each Change

For every changed file, classify it into one of these categories:

| Category | Documentation Impact | Action |
|----------|---------------------|--------|
| **New domain/module** | HIGH — needs new section in docs | Create section |
| **New schema/table/enum** | HIGH — needs schema docs update | Update schema docs |
| **New API route** | HIGH — needs API docs update | Update API docs |
| **New ERP screen/permission** | HIGH — needs RBAC docs update | Update ERP docs |
| **New business rule/invariant** | HIGH — needs invariant section | Add invariant |
| **Refactor of existing module** | MEDIUM — may need docs update | Verify accuracy |
| **Bug fix** | LOW — usually no docs impact | Skip unless pattern changed |
| **Dependency update** | LOW — usually no docs impact | Skip unless major |
| **Style/formatting** | NONE | Skip |

### 2.3 Deep-Dive on HIGH-Impact Changes

For every HIGH-impact change, open the ACTUAL source file and extract:

1. **What it does**: read the code, understand the behavior
2. **Key functions/classes**: names, signatures, purpose
3. **Business rules**: invariants, constraints, edge cases
4. **Dependencies**: what other modules it interacts with
5. **Configuration**: env vars, constants, feature flags

> [!IMPORTANT]
> **NEVER document based on commit messages alone.** Always open the real
> source file and read the implementation. Commit messages can be misleading,
> incomplete, or wrong.

---

## Phase 3: Gap Analysis — Find What's Missing or Wrong

### 3.1 Cross-Reference Code vs Docs

For each documentation file, verify:

1. **Completeness**: every domain/module in the codebase has a corresponding
   section in at least one doc file
2. **Accuracy**: file paths, function names, and technical details match the
   actual code
3. **Currency**: no references to deleted files, renamed functions, or
   deprecated patterns
4. **Consistency**: the same information is not contradicted between different
   doc files

### 3.2 Run Automated Staleness Checks

```bash
# Find file paths mentioned in docs that no longer exist
grep -roh 'src/[a-zA-Z0-9_./-]*' docs/ AGENTS.md CLAUDE.md README.md .agents/ 2>/dev/null \
  | sort -u \
  | while read -r f; do [ ! -e "$f" ] && echo "STALE REF: $f"; done

# Find key terms in docs and verify they still exist in code
# (adjust grep patterns for your project)
grep -roh '[a-zA-Z]*\.[a-zA-Z]*\.ts' docs/ AGENTS.md CLAUDE.md 2>/dev/null \
  | sort -u \
  | while read -r f; do
      found=$(find src/ -name "$f" 2>/dev/null | head -1)
      [ -z "$found" ] && echo "STALE FILE REF: $f"
    done
```

### 3.3 Produce Gap Report

Create a structured list of all gaps found:

```markdown
## Gap Report

### Missing Documentation (code exists, docs don't)
- [ ] `src/lib/newmodule/...` — new module with no doc coverage
- [ ] `src/db/schema/newTable.ts` — new table not in schema docs

### Stale Documentation (docs reference code that changed/deleted)
- [ ] `docs/checkout/flow.md` line 42 references `oldFunction()` — renamed to `newFunction()`
- [ ] `AGENTS.md` mentions `src/lib/old.ts` — file was deleted

### Inconsistent Documentation (docs contradict each other)
- [ ] README says "3 gateways" but AGENTS.md lists 4

### Accuracy Issues (docs describe wrong behavior)
- [ ] `CLAUDE.md` says trial uses boleto only — code shows PIX priority with boleto fallback
```

---

## Phase 4: Execution — Update Documentation

### 4.1 Update Order (MANDATORY)

Always update documentation in this exact order to maintain consistency:

1. **Domain docs** (`docs/**/*.md`) — deepest, most detailed
2. **AI agent rules** (`AGENTS.md`, `CLAUDE.md`, `.agents/`) — invariants and rules
3. **README.md** — high-level overview (last, because it summarizes everything)

> [!WARNING]
> **Never update README.md first.** It summarizes information from the deeper
> docs. If you update README first, you risk inconsistency when you later
> discover the domain docs need different content.

### 4.2 Rules for Each Documentation Layer

#### Domain Docs (`docs/**/*.md`)

- **Purpose**: deep technical reference for a specific domain
- **Audience**: AI agents and senior developers
- **Content**: architecture, invariants, file references, data flows, anti-patterns, checklists
- **Tone**: technical, precise, no marketing language
- **Structure**: follow existing doc structure in the project; if no structure exists, use:
  1. Objetivo (purpose)
  2. Visao geral (overview)
  3. Arquivos fonte de verdade (source-of-truth files)
  4. Modelo de dados / fluxo (data model or flow)
  5. Invariantes criticos (critical invariants)
  6. O que revisar antes de alterar (pre-change checklist)
  7. Anti-padroes (anti-patterns)
  8. Checklist final (final checklist)

#### AI Agent Rules (`AGENTS.md`, `CLAUDE.md`, `.agents/rules/*.md`)

- **Purpose**: prevent AI agents from making mistakes
- **Audience**: AI coding assistants (Claude, Codex, Antigravity, Cursor, Copilot)
- **Content**: invariants, mandatory reading order, file references, "never do X" rules
- **Tone**: imperative, direct, no ambiguity
- **Key sections**:
  - Reading order (which docs to read first)
  - Invariants (rules that must never be broken)
  - Per-domain rules (checkout, billing, API, ERP, etc.)
  - Output checklist (what the agent must report at the end)

#### Agent Workflows (`.agents/workflows/*.md`)

- **Purpose**: step-by-step process for specific task types
- **Audience**: Antigravity agent
- **Content**: ordered steps for bugfix, feature, refactor, etc.
- **Key elements**:
  - Reading order with doc references
  - Source-of-truth files to inspect
  - Invariant verification checklist
  - Validation commands
  - Required output format

#### README.md

- **Purpose**: first-impression developer documentation
- **Audience**: new developers, reviewers, stakeholders
- **Content**: product vision, stack, setup, directory map, key patterns
- **Tone**: clear, professional, not overly detailed
- **Must include**:
  - Product vision and architecture summary
  - Tech stack
  - Setup instructions
  - Directory structure (updated to match reality)
  - Key patterns and conventions
  - Links to domain docs
  - Agent documentation index

### 4.3 Consistency Rules

When updating multiple files, ensure:

1. **Same terms everywhere**: if a function is called `transmitInvoiceSync` in code,
   use that exact name in ALL docs — never paraphrase
2. **Same file paths**: if a file moved from `src/lib/old.ts` to `src/lib/new.ts`,
   update ALL docs, not just one
3. **Same counts**: if schema has 55+ files, ALL docs that mention it must say 55+
4. **Same domain names**: if a domain is called "Cadastro público de cliente" in
   AGENTS.md, use the exact same name in README and docs
5. **Cross-reference new docs**: if you create `docs/billing/invoices-and-fiscal.md`,
   add references to it in AGENTS.md, CLAUDE.md, .agents/rules, and README

### 4.4 Verification After Updates

After all updates are complete, run verification:

```bash
# Count lines in all updated files
wc -l README.md AGENTS.md CLAUDE.md .agents/rules/*.md .agents/workflows/*.md docs/**/*.md 2>/dev/null

# Verify key terms appear in correct files
for term in "term1" "term2" "term3"; do
  echo "--- $term ---"
  grep -rl "$term" README.md AGENTS.md CLAUDE.md .agents/ docs/ 2>/dev/null
done

# Check for stale references (files mentioned in docs that don't exist)
grep -roh 'src/[a-zA-Z0-9_./-]*\.\(ts\|tsx\|js\)' \
  README.md AGENTS.md CLAUDE.md .agents/ docs/ 2>/dev/null \
  | sort -u \
  | while read -r f; do [ ! -e "$f" ] && echo "BROKEN REF: $f"; done
```

---

## Phase 5: Scaffolding — When Files Don't Exist

If the project is missing documentation files that should exist, create them
following these templates:

### 5.1 When to Scaffold

Create missing files when:

- No `README.md` exists → create it
- No `AGENTS.md` or `CLAUDE.md` exists but the project has AI agents → create them
- No `.agents/` directory exists but Antigravity is used → create it
- No `docs/` directory exists but the project has multiple domains → create it
- A domain exists in code but has no dedicated doc → create a doc for it

### 5.2 Scaffolding Order

1. `docs/architecture.md` (if missing) — always first
2. Domain docs in `docs/<domain>/` — one per major domain
3. `AGENTS.md` — with reading order, invariants, rules
4. `CLAUDE.md` — mirror of AGENTS.md adapted for Claude
5. `.agents/rules/<project>.md` — Antigravity workspace rules
6. `.agents/workflows/` — bugfix and feature workflows
7. `README.md` — last, summarizes everything above

### 5.3 Minimum Viable Documentation

For a project with no docs at all, the ABSOLUTE MINIMUM is:

```
README.md                          # Product + stack + setup + structure
AGENTS.md                          # AI rules + invariants
docs/architecture.md               # Architecture overview + decisions
```

Everything else is valuable but not blocking.

---

## Phase 6: Output — Report What Was Done

### 6.1 Mandatory Output

After completing all updates, produce a report with:

1. **Files altered**: path, before/after line count, summary of changes
2. **Files created**: path, purpose, line count
3. **Gaps resolved**: list of gaps from Phase 3 that were fixed
4. **Remaining gaps**: anything that couldn't be resolved (needs user input)
5. **Stale references fixed**: broken file paths or function names corrected
6. **Verification results**: output of the verification commands from 4.4
7. **Risks**: anything that might be wrong or needs manual review

### 6.2 Present as Walkthrough Artifact

Create or update a `walkthrough.md` artifact summarizing:

- What was discovered
- What was updated
- Verification results
- Before/after comparison table

---

## Common Mistakes to Avoid

1. **Documenting from memory**: never write docs based on what you "think"
   the code does. ALWAYS read the actual source file first.

2. **Updating only one file**: if a change affects AGENTS.md, it almost
   certainly also affects CLAUDE.md, .agents/rules, and possibly README.
   Update ALL affected files.

3. **Inventing patterns**: never document a convention that doesn't exist
   in the real code. If you see inconsistency, flag it — don't normalize it.

4. **Referencing deleted files**: always verify file paths exist before
   writing them into documentation.

5. **Forgetting the verification step**: always run the verification
   commands from Phase 4.4 before declaring done.

6. **Updating README first**: README summarizes deeper docs. Update it LAST.

7. **Creating docs for trivial changes**: bug fixes, style changes, and
   dependency bumps rarely need documentation updates. Focus on structural
   changes, new domains, new invariants, and new business rules.

8. **Mixing languages**: if the project uses PT-BR for docs, ALL new docs
   must also be PT-BR. If EN, all EN. Never mix. Match the existing convention.

9. **Editing generated/mirror docs**: never hand-edit tool-synced copies
   (e.g. `.maestri/roles/*/AGENTS.md`, vendored snapshots). Edit only the
   canonical root files; the tool regenerates its mirror.
