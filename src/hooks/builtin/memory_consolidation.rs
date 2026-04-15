//! Memory consolidation hook (legacy registration).
//!
//! Consolidation is **awaited** on the QueryEngine / Agent hot path; this handler stays
//! registered so existing configs keep a stable hook name, but it performs no work to
//! avoid duplicate LLM consolidation calls.

use async_trait::async_trait;
use std::sync::Arc;

use crate::hooks::traits::HookHandler;
use crate::memory::traits::Memory;
use crate::providers::traits::Provider;

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
        _user_message: &str,
        _assistant_summary: &str,
    ) {
        let _ = (&self.provider, &self.model, &self.memory);
    }
}
