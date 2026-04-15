//! Per-session turn summaries on disk (`session-memory/<uuid>.md`).

use super::layered_paths::session_memory_dir;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Write one markdown file for this turn (YAML frontmatter + body).
pub async fn write_turn_file(
    workspace_dir: &Path,
    session_key: &str,
    history_summary: &str,
    user_excerpt: &str,
    assistant_excerpt: &str,
) -> anyhow::Result<PathBuf> {
    let dir = session_memory_dir(workspace_dir, session_key);
    tokio::fs::create_dir_all(&dir).await?;
    let id = Uuid::new_v4();
    let path = dir.join(format!("{id}.md"));
    let now = chrono::Utc::now().to_rfc3339();
    let u_ex = truncate(user_excerpt, 1200);
    let a_ex = truncate(assistant_excerpt, 2400);
    let body = format!(
        "---\nkind: session_turn\nlast_updated: {now}\n---\n\n## Summary\n\n{history_summary}\n\n## User (excerpt)\n\n{u_ex}\n\n## Assistant (excerpt)\n\n{a_ex}\n"
    );
    tokio::fs::write(&path, body).await?;
    Ok(path)
}

fn truncate(s: &str, max_chars: usize) -> String {
    let n = s.chars().count();
    if n <= max_chars {
        return s.to_string();
    }
    let head: String = s.chars().take(max_chars).collect();
    format!("{head}\n… [truncated from {n} chars]\n")
}

/// Latest session-memory file content (most recently modified), if any.
pub async fn read_latest_summary(workspace_dir: &Path, session_key: &str) -> Option<String> {
    let dir = session_memory_dir(workspace_dir, session_key);
    let mut rd = tokio::fs::read_dir(&dir).await.ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    while let Ok(Some(e)) = rd.next_entry().await {
        let p = e.path();
        if p.extension()?.to_str()? != "md" {
            continue;
        }
        let meta = tokio::fs::metadata(&p).await.ok()?;
        let mt = meta.modified().ok()?;
        match &best {
            None => best = Some((mt, p)),
            Some((t0, _)) if mt > *t0 => best = Some((mt, p)),
            _ => {}
        }
    }
    let p = best?.1;
    let s = tokio::fs::read_to_string(&p).await.ok()?;
    Some(strip_frontmatter_summary(&s))
}

fn strip_frontmatter_summary(raw: &str) -> String {
    let t = raw.trim();
    if let Some(rest) = t.strip_prefix("---") {
        if let Some(idx) = rest.find("\n---") {
            let after = rest[idx + 4..].trim_start_matches('-').trim_start();
            return truncate(after, 3500);
        }
    }
    truncate(t, 3500)
}
