# Project Brief: OSCAR

> A live prompt co-pilot for AI agent interfaces

## The problem

Most prompt failures aren't the model's fault — they're the human's. We type fast, assume context, forget to say what we don't want, and leave the agent to hallucinate our intent. The gap between what we mean and what we say is where agentic workflows break down. Senior developers are often the worst offenders — they carry so much implicit context that they forget the agent has none.

## The idea

OSCAR is a live prompt co-pilot that runs inside the composer of AI agent interfaces — think Claude Code, Codex, terminal-adjacent dev tools. As you type, a drawer expands above the input that decomposes your prompt in real time and reflects back a structured understanding of your intent before you hit send.

The goal is simple: **start working before you do.**

## The drawer

As the user types, the drawer surfaces five live dimensions:

- **O — Objectives** — what the agent thinks you're actually trying to achieve, stated plainly
- **S — Scope** — implied constraints, limits, and rails you haven't explicitly stated
- **C — Constraints** — hard boundaries inferred from your phrasing that the agent should not cross
- **A — Ambiguities** — places where the agent could reasonably go two different directions
- **R — Risks** — anti-patterns and failure modes inferred from your instruction

Each dimension updates as you type. The drawer is a live contract being negotiated between you and the agent before execution begins.

## The background agent layer

Behind the drawer, a set of lightweight background agents spin up as you type. Each one owns a single dimension of the OSCAR framework and reports back in real time. Their output streams into the drawer visually, so the user can see the work happening — not just the result. This layer is the core mechanic: it externalises the implicit, making visible the things a competent human collaborator would ask before starting.

## What makes it different

This is not autocomplete. It is not a prompt template. It is not a suggestion engine. It is a **comprehension mirror** — it shows you what the agent heard, not what you said. The distinction matters because the user's job isn't to write better prompts in isolation, it is to close the gap between their intent and the agent's understanding in real time, before any work begins.

## The interaction

The drawer is read-only in the first instance — a passive confirmation layer. The user sees their prompt being understood, structured, and stress-tested in real time. Ambiguities are flagged. Risks are surfaced. Scope is inferred. The user can refine their prompt based on what they see, or proceed with confidence that the agent has enough to work with.

## Target context

Developer-first. The natural home for OSCAR is inside the composer of agentic coding tools — the prompt bar in Claude Code, Codex, or similar terminal-adjacent interfaces. The users who benefit most are developers who know what they want but habitually underspecify it.

## Hackathon scope

For the hackathon, OSCAR is demonstrated as a **standalone web app**: a mocked agent-composer interface (chat input, fake transcript, styled to read like a Claude Code-style tool) with the live drawer built on top. The "as you type" mechanic runs on a debounced rhythm — analysis fires when you pause, and streams in while you read. See [tech-spec.md](./tech-spec.md) for the build.

### Out of scope (v1)

- No prompt rewriting or suggested edits — the drawer is read-only
- No actual agent execution behind the composer
- No IDE or Claude Code integration
- Single-turn prompts only — no conversation-history analysis

## The one-line pitch

**OSCAR starts working before you hit send.**
