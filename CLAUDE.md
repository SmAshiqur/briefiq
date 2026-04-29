# CLAUDE.md

This file points to the canonical project context for AI agents.

**Read [AGENTS.md](AGENTS.md) first.** It contains:

- Product overview (BriefIQ — AI-driven personal briefing system)
- Stack (NestJS + TypeScript backend, SwiftUI iOS app)
- Repo layout
- Local dev commands
- LLM gateway pattern
- Project conventions
- Product philosophy

## File-specific AI rules

Cursor activates these automatically based on which files you have open:

- iOS Swift code → [.cursor/rules/swift-ios.mdc](.cursor/rules/swift-ios.mdc)
- NestJS TypeScript code → [.cursor/rules/nestjs-backend.mdc](.cursor/rules/nestjs-backend.mdc)
- AI pipeline services → [.cursor/rules/ai-pipeline.mdc](.cursor/rules/ai-pipeline.mdc)
- Universal repo conventions → [.cursor/rules/conventions.mdc](.cursor/rules/conventions.mdc)

## Repeated workflows (project skills)

Apply when the relevant trigger appears:

- Adding a new LLM prompt → [.cursor/skills/add-llm-prompt/SKILL.md](.cursor/skills/add-llm-prompt/SKILL.md)
- Adding a new NestJS module → [.cursor/skills/add-nestjs-module/SKILL.md](.cursor/skills/add-nestjs-module/SKILL.md)
- Adding a new iOS feature → [.cursor/skills/add-ios-feature/SKILL.md](.cursor/skills/add-ios-feature/SKILL.md)

## Architecture and roadmap

The full plan with two-paragraph reasoning for every major decision (vector store, framework, LLM gateway, etc.) and the 8-week phased build is in [briefiq_ios_architecture_exec.plan.md](briefiq_ios_architecture_exec.plan.md).
