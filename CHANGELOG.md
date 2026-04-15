# Changelog

## [Unreleased]

### Breaking changes

- The tool-call loop and WebSocket streaming path now use `TurnEventSink` instead of a raw `String` delta channel. Downstream code that called `run_tool_call_loop` with an `mpsc::Sender<String>` must switch to `mpsc::Sender<TurnEventSink>` (see `DeltaText` vs `Emit` in `src/agent/agent.rs`).
- The `query_engine_v2` feature flag and legacy non-v2 branches were removed earlier; only the QueryEngine-orchestrated path remains. After `git pull`, run `cargo clean && cargo build` if you hit stale incremental-build errors.

### Improvements

- The tool-call loop emits structured `TurnEvent` values (`ToolCall`, `ToolResult`) alongside draft progress strings so Web and channel consumers can share one ordering-preserving stream.
