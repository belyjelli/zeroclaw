//! Post-turn hook helpers (blocking + fire-and-forget) built on [`crate::hooks::HookRunner`].

use crate::hooks::{HookResult, HookRunner};

/// Run void post-turn hooks in parallel (best-effort).
pub async fn fire_after_turn_void(
    runner: &HookRunner,
    channel: &str,
    user_message: &str,
    assistant_summary: &str,
) {
    runner
        .fire_after_turn_completed(channel, user_message, assistant_summary)
        .await;
}

/// Run blocking post-turn hooks in priority order; first cancel stops the chain.
pub async fn run_after_turn_blocking(
    runner: &HookRunner,
    channel: &str,
    user_message: &str,
    assistant_summary: &str,
) -> HookResult<()> {
    runner
        .run_after_turn_completed_blocking(channel, user_message, assistant_summary)
        .await
}
