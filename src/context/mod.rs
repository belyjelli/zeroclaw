//! Dynamic and hierarchical context assembly for the agent loop (Claude Code–style roadmap).
//!
//! # Cache invalidation
//!
//! [`fingerprint::ContextFingerprint`] changes when:
//! - Any discovered instruction file’s path or modification time changes (`AGENTS.md`, `CLAUDE.md`, …).
//! - `git rev-parse HEAD` changes (when present).
//!
//! When [`assembler::ContextAssemblyOptions::enabled`] is `false` (default), [`assembler::DefaultContextAssembler`]
//! still computes the fingerprint for future memoization but returns an empty `dynamic_block` so existing
//! prompts are unchanged until Phase 1 wires this in.
//!
//! Session memoization (Phase 1) will cache [`assembler::AssembledContext`] by fingerprint between tool iterations.

#![allow(unused_imports)] // `pub use` reexports are for the library surface; the CLI bin shares this tree.

use std::path::{Path, PathBuf};

use anyhow::Result;

pub mod assembler;
pub mod fingerprint;
pub mod git_snapshot;
pub mod layers;

pub use assembler::{
    AssembledContext, ContextAssembler, ContextAssemblyInput, ContextAssemblyOptions,
    DefaultContextAssembler,
};
pub use fingerprint::{
    compute_fingerprint, git_head_sha, instruction_files_with_mtime, ContextFingerprint,
};
pub use git_snapshot::{capture_git_snapshot, GitSnapshot};
pub use layers::{collect_layered_instruction_paths, ContextLayer, INSTRUCTION_FILENAMES};

/// Optional roots for hierarchical instruction discovery (`AGENTS.md`, `CLAUDE.md`, …).
#[derive(Debug, Clone, Copy, Default)]
pub struct DynamicContextPaths<'a> {
    pub global_config_dir: Option<&'a Path>,
    pub user_config_dir: Option<&'a Path>,
    pub session_dir: Option<&'a Path>,
}

/// Returns `~/.zeroclaw` when the home directory is available.
#[must_use]
pub fn default_user_zeroclaw_dir() -> Option<PathBuf> {
    directories::BaseDirs::new().map(|b| b.home_dir().join(".zeroclaw"))
}

/// Builds the markdown block appended to the system prompt when `[agent.dynamic_context]` is enabled.
pub fn format_dynamic_context_block(
    cfg: &crate::config::DynamicContextConfig,
    workspace: &Path,
    paths: DynamicContextPaths<'_>,
) -> Result<String> {
    if !cfg.enabled {
        return Ok(String::new());
    }
    let input = ContextAssemblyInput {
        workspace: workspace.to_path_buf(),
        global_config_dir: paths.global_config_dir.map(Path::to_path_buf),
        user_config_dir: paths.user_config_dir.map(Path::to_path_buf),
        session_dir: paths.session_dir.map(Path::to_path_buf),
        options: ContextAssemblyOptions {
            enabled: true,
            include_git_snapshot: cfg.include_git,
            max_git_log_lines: cfg.max_git_log_lines,
        },
    };
    let assembled = DefaultContextAssembler.assemble(&input)?;
    Ok(assembled.dynamic_block)
}
