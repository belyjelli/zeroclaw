//! LLM-driven memory consolidation after a successful turn (replaces ad-hoc `tokio::spawn` in channels).

use async_trait::async_trait;
use std::sync::Arc;

use crate::hooks::traits::HookHandler;
use crate::memory::traits::Memory;
use crate::providers::traits::Provider;

/// Same threshold as channel auto-save consolidation.
const MIN_MESSAGE_CHARS: usize = 20;

pub struct MemoryConsolidationHook {
    provider: Arc<dyn Provider>,
    model: String,
    memory: Arc<dyn Memory>,
}

impl MemoryConsolidationHook {
    pub fn new(provider: Arc<dyn Provider>, model: String, memory: Arc<dyn Memory>) -> Self {
        Self {
            provider,
            model,
            memory,
        }
    }
}

#[async_trait]
impl HookHandler for MemoryConsolidationHook {
    fn name(&self) -> &str {
        "memory-consolidation"
    }

    async fn on_after_turn_completed(
        &self,
        _channel: &str,
        user_message: &str,
        assistant_summary: &str,
    ) {
        if user_message.chars().count() < MIN_MESSAGE_CHARS {
            return;
        }
        let provider = Arc::clone(&self.provider);
        let model = self.model.clone();
        let memory = Arc::clone(&self.memory);
        let user_msg = user_message.to_string();
        let assistant = assistant_summary.to_string();
        tokio::spawn(async move {
            if let Err(e) = crate::memory::consolidation::consolidate_turn(
                provider.as_ref(),
                &model,
                memory.as_ref(),
                &user_msg,
                &assistant,
            )
            .await
            {
                tracing::debug!("Memory consolidation skipped: {e}");
            }
        });
    }
}
