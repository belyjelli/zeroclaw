//! Static dashboard files: embedded `web/dist/` and optional `[webui]` disk override.
//!
//! Handlers live in [`super::web_ui`].

pub use super::web_ui::{handle_spa_fallback, handle_static};
