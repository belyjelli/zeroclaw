# Change Playbooks

Step-by-step guides for common extension and modification patterns in ZeroClaw.

For complete code examples of each extension trait, see [extension-examples.md](./extension-examples.md).

## Adding a Provider

- Implement `Provider` in `src/providers/`.
- Register in `src/providers/mod.rs` factory.
- Add focused tests for factory wiring and error paths.
- Avoid provider-specific behavior leaks into shared orchestration code.

## Adding a Channel

- Implement `Channel` in `src/channels/`.
- Keep `send`, `listen`, `health_check`, typing semantics consistent.
- Cover auth/allowlist/health behavior with tests.

## Adding a Tool

- Implement `Tool` in `src/tools/` with strict parameter schema.
- Validate and sanitize all inputs.
- Return structured `ToolResult`; avoid panics in runtime path.

## Adding a Peripheral

- Implement `Peripheral` in `src/peripherals/`.
- Peripherals expose `tools()` — each tool delegates to the hardware (GPIO, sensors, etc.).
- Register board type in config schema if needed.
- See `docs/hardware/hardware-peripherals-design.md` for protocol and firmware notes.

## Security / Runtime / Gateway Changes

- Include threat/risk notes and rollback strategy.
- Add/update tests or validation evidence for failure modes and boundaries.
- Keep observability useful but non-sensitive.
- For `.github/workflows/**` changes, include Actions allowlist impact in PR notes and update `docs/contributing/actions-source-policy.md` when sources change.

## Docs System / README / IA Changes

- Treat docs navigation as product UX: preserve clear pathing from README -> docs hub -> SUMMARY -> category index.
- Keep top-level nav concise; avoid duplicative links across adjacent nav blocks.
- When runtime surfaces change, update related references in `docs/reference/`.
- Keep multilingual entry-point parity for all supported locales (`en`, `zh-CN`, `ja`, `ru`, `fr`, `vi`) when nav or key wording changes.
- When shared docs wording changes, sync corresponding localized docs in the same PR (or explicitly document deferral and follow-up PR).

## Tool Shared State

- Follow the `Arc<RwLock<T>>` handle pattern for any tool that owns long-lived shared state.
- Accept handles at construction; do not create global/static mutable state.
- Use `ClientId` (provided by the daemon) to namespace per-client state — never construct identity keys inside the tool.
- Isolate security-sensitive state (credentials, quotas) per client; broadcast/display state may be shared with optional namespace prefixing.
- Cached validation is invalidated on config change — tools must re-validate before the next execution when signaled.
- See [ADR-004: Tool Shared State Ownership](../architecture/adr-004-tool-shared-state-ownership.md) for the full contract.

## Agent tool loop, QueryEngine, and hooks

- **Single tool path:** `run_tool_call_loop` in `src/agent/loop_.rs` always enters `src/agent/query_engine.rs` via `run_query_loop`, which records [`TransitionReason`](../../src/agent/state.rs) diagnostics and runs **void + blocking** post-turn hooks on success (`src/agent/stop_hooks.rs`). There is **no** `query_engine_v2` Cargo feature; this path is always on.
- **Compaction:** Pre–LLM-call trimming uses `src/agent/compaction_pipeline.rs` (named stages + `history_pruner`); reactive context retries use the same module’s helpers where wired from the loop.
- **System prompt:** Canonical assembly lives in `src/agent/system_prompt.rs` (memoized static prefix + volatile tail; `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` for splitting). `src/channels/mod.rs` `build_system_prompt_*` delegates there; some paths pass `system_prompt_refresh` into `run_tool_call_loop` so `src/agent/loop_.rs` refreshes `history[0]` after `run_pre_llm_phases`. `src/providers/anthropic.rs` maps that marker to two system blocks for prompt caching. In-process stats: `crate::agent::query_engine::last_system_prompt_assembly` and `zeroclaw doctor query-engine` (also prints layered-memory selector stats when `[memory.layered]` is used).
- **Transcript-first:** User lines for session JSONL should be committed via `session_transcript::commit_user_turn` at the orchestration boundary before model work (channels and `Agent::turn` / `turn_streamed` follow this pattern).
- **Hook runner construction:** `crate::hooks::hook_runner_from_config` (`src/hooks/mod.rs`) registers configured builtins when `[hooks].enabled`, and registers **`MemoryConsolidationHook`** whenever `memory.auto_save` is true (even if hooks are disabled), so consolidation stays off the hot path without duplicating `tokio::spawn` in channels. Layered SessionMemory / AutoMemory filesystem writes piggyback on `src/memory/consolidation.rs` (same spawned task) when `[memory.layered]` is enabled — see `src/memory/layered_context.rs` for the pending-turn slot used across `tokio::spawn`.
- **Gateway:** Build `HookRunner` in `run_gateway`, store on `AppState.hooks`, pass `state.hooks.clone()` into `Agent::from_config_with_hooks` for `/ws/chat` so post-turn hooks match channel behavior.
- **Streaming turn sink:** `run_tool_call_loop` / `run_query_loop` accept optional `turn_event_sink` (`Sender<TurnEventSink>`): [`TurnEventSink::DeltaText`](../../src/agent/agent.rs) carries draft/progress strings from the tool loop; [`TurnEventSink::Emit`](../../src/agent/agent.rs) wraps [`TurnEvent`](../../src/agent/agent.rs) for model chunks and tool telemetry. [`Agent::turn_streamed`](../../src/agent/agent.rs) uses the same type; [`src/gateway/ws.rs`](../../src/gateway/ws.rs) maps both to WebSocket JSON (`chunk`, `tool_call`, `tool_result`, then `chunk_reset` + `done`). User-facing protocol: [`.claude/skills/zeroclaw/references/rest-api.md`](../../.claude/skills/zeroclaw/references/rest-api.md).
- **Extending post-turn behavior:** implement `HookHandler::on_after_turn_completed` / `after_turn_completed_blocking` (they receive `user_message` + `assistant_summary`); register on the same `HookRunner` the gateway or channels use.

## Architecture Boundary Rules

- Extend capabilities by adding trait implementations + factory wiring first; avoid cross-module rewrites for isolated features.
- Keep dependency direction inward to contracts: concrete integrations depend on trait/config/util layers, not on other concrete integrations.
- Avoid cross-subsystem coupling (e.g., provider code importing channel internals, tool code mutating gateway policy directly).
- Keep module responsibilities single-purpose: orchestration in `agent/`, transport in `channels/`, model I/O in `providers/`, policy in `security/`, execution in `tools/`.
- Introduce new shared abstractions only after repeated use (rule-of-three), with at least one real caller.
- For config/schema changes, treat keys as public contract: document defaults, compatibility impact, and migration/rollback path.
