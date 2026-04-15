//! Explicit engine state for the QueryEngine orchestration path.

/// Reason for the last state transition (auditing / diagnostics).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionReason {
    BeginTurn,
    PreModelCompaction,
    /// Entering another model round after tool execution (article-style continuation).
    ToolUseContinuation,
    ModelCall,
    ToolRound,
    PostToolHooks,
    RetryAfterCompaction,
    /// Reactive trim after HTTP 400/413-style context errors.
    ReactiveCompactRetry,
    /// Recovery nudge after suspected max-output-token truncation.
    MaxOutputTokensRecovery,
    /// Auto-continue when under token budget (post-stop-hook path).
    TokenBudgetContinuation,
    /// Blocking stop-hook prevented or altered continuation.
    StopHookBlocking,
    BudgetHalt,
    Cancelled,
    LoopDetectorInterrupt,
    ModelSwitch,
    TurnComplete,
    /// Turn ended with an error (non-cancel).
    TurnError,
}

/// One transition step recorded for QueryEngine diagnostics.
#[derive(Debug, Clone)]
pub struct TurnTransition {
    pub reason: TransitionReason,
    pub detail: Option<String>,
}

/// Lightweight turn-local state (iteration is owned by the tool loop).
#[derive(Debug, Clone, Default)]
pub struct EngineState {
    pub iteration: usize,
    pub last_transition: Option<TransitionReason>,
}
