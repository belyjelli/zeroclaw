//! Per-turn context for layered memory (session key + workspace).
//!
//! `tokio::spawn` in consolidation hooks does not inherit task-locals, so we mirror the
//! QueryEngine pattern: a process-global "pending turn" slot installed immediately before
//! `run_tool_call_loop` and read (cloned) when the consolidation task starts.

use crate::config::LayeredMemoryConfig;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

#[derive(Clone)]
pub struct LayeredTurnContext {
    pub workspace_dir: PathBuf,
    pub session_key: String,
    pub layered: LayeredMemoryConfig,
}

static PENDING_LAYERED_TURN: LazyLock<Mutex<Option<LayeredTurnContext>>> =
    LazyLock::new(|| Mutex::new(None));

/// Call before `run_tool_call_loop` when layered memory may run this turn.
pub fn install_pending_layered_turn(ctx: Option<LayeredTurnContext>) {
    if let Ok(mut g) = PENDING_LAYERED_TURN.lock() {
        *g = ctx;
    }
}

/// Snapshot for `tokio::spawn` (e.g. memory consolidation) — does not remove the slot.
#[must_use]
pub fn peek_pending_layered_turn() -> Option<LayeredTurnContext> {
    PENDING_LAYERED_TURN.lock().ok().and_then(|g| g.clone())
}
