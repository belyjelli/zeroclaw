//! QueryEngine: diagnostics + traced delegation into [`super::loop_::run_tool_call_loop_body`].
//!
//! This module is the canonical orchestration boundary (lesson 04-style): one turn runs inside
//! [`run_query_loop`], which records transitions and runs post-turn stop hooks.

use super::state::{EngineState, TransitionReason, TurnTransition};
use super::TurnEventSink;
use crate::approval::ApprovalManager;
use crate::hooks::{HookResult, HookRunner};
use crate::observability::Observer;
use crate::providers::{ChatMessage, Provider};
use crate::tools::Tool;
use anyhow::Result;
use std::collections::VecDeque;
use std::sync::{LazyLock, Mutex};
use tokio_util::sync::CancellationToken;

const DIAG_CAP: usize = 64;

#[derive(Debug, Clone)]
struct DiagEntry {
    pub ts: std::time::Instant,
    pub transition: TurnTransition,
}

static QUERY_ENGINE_DIAG: LazyLock<Mutex<VecDeque<DiagEntry>>> =
    LazyLock::new(|| Mutex::new(VecDeque::with_capacity(DIAG_CAP)));

pub fn record_transition(reason: TransitionReason, detail: Option<String>) {
    let mut q = QUERY_ENGINE_DIAG.lock().unwrap_or_else(|p| p.into_inner());
    if q.len() >= DIAG_CAP {
        q.pop_front();
    }
    q.push_back(DiagEntry {
        ts: std::time::Instant::now(),
        transition: TurnTransition { reason, detail },
    });
}

/// Recent transitions for `zeroclaw doctor query-engine`.
#[must_use]
pub fn drain_diagnostics() -> Vec<TurnTransition> {
    QUERY_ENGINE_DIAG
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .iter()
        .map(|e| e.transition.clone())
        .collect()
}

/// Heuristic: model may have stopped early due to output token cap — caller may append a nudge.
#[must_use]
pub fn should_request_token_continuation(
    usage: Option<&crate::providers::traits::TokenUsage>,
    output_text_chars: usize,
) -> bool {
    let Some(u) = usage else {
        return false;
    };
    let Some(out) = u.output_tokens else {
        return false;
    };
    // Without provider-reported max_output_tokens, use a conservative heuristic:
    // large billed output with almost no visible text often indicates truncation.
    out >= 900 && output_text_chars < 24
}

/// Article-style outer turn loop: diagnostics + body + post-turn hooks.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn run_query_loop(
    state: &mut EngineState,
    provider: &dyn Provider,
    history: &mut Vec<ChatMessage>,
    tools_registry: &[Box<dyn Tool>],
    observer: &dyn Observer,
    provider_name: &str,
    model: &str,
    temperature: f64,
    silent: bool,
    approval: Option<&ApprovalManager>,
    channel_name: &str,
    channel_reply_target: Option<&str>,
    multimodal_config: &crate::config::MultimodalConfig,
    max_tool_iterations: usize,
    cancellation_token: Option<CancellationToken>,
    turn_event_sink: Option<tokio::sync::mpsc::Sender<TurnEventSink>>,
    hooks: Option<&HookRunner>,
    excluded_tools: &[String],
    dedup_exempt_tools: &[String],
    activated_tools: Option<&std::sync::Arc<std::sync::Mutex<crate::tools::ActivatedToolSet>>>,
    model_switch_callback: Option<super::loop_::ModelSwitchCallback>,
    pacing: &crate::config::PacingConfig,
    tool_result_offload: &crate::config::ToolResultOffloadConfig,
    history_pruning: &crate::agent::history_pruner::HistoryPrunerConfig,
    turn_user_message: Option<&str>,
) -> Result<String> {
    state.last_transition = Some(TransitionReason::BeginTurn);
    record_transition(TransitionReason::BeginTurn, None);
    let res = super::loop_::run_tool_call_loop_body(
        provider,
        history,
        tools_registry,
        observer,
        provider_name,
        model,
        temperature,
        silent,
        approval,
        channel_name,
        channel_reply_target,
        multimodal_config,
        max_tool_iterations,
        cancellation_token,
        turn_event_sink,
        hooks,
        excluded_tools,
        dedup_exempt_tools,
        activated_tools,
        model_switch_callback,
        pacing,
        tool_result_offload,
        history_pruning,
    )
    .await;
    match &res {
        Ok(_) => {
            state.last_transition = Some(TransitionReason::TurnComplete);
            record_transition(TransitionReason::TurnComplete, None);
        }
        Err(e) => {
            state.last_transition = Some(TransitionReason::TurnError);
            record_transition(TransitionReason::TurnError, Some(e.to_string()));
        }
    }
    if let (Ok(text), Some(hooks)) = (&res, hooks) {
        let user = turn_user_message.unwrap_or("");
        super::stop_hooks::fire_after_turn_void(hooks, channel_name, user, text.as_str()).await;
        match super::stop_hooks::run_after_turn_blocking(hooks, channel_name, user, text.as_str())
            .await
        {
            HookResult::Continue(()) => {}
            HookResult::Cancel(reason) => {
                record_transition(TransitionReason::StopHookBlocking, Some(reason));
            }
        }
    }
    res
}
