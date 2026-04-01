//! Read-only git snapshot for dynamic context (branch, short status, recent commits).

use std::fmt::Write as _;
use std::path::Path;
use std::process::Command;

const MAX_PORCELAIN_CHARS: usize = 4_000;

/// Summary of repository state for injection into prompts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitSnapshot {
    pub branch: String,
    pub porcelain: String,
    pub recent_commits: Vec<String>,
}

impl GitSnapshot {
    /// Renders a markdown-friendly block for system or user-side context.
    #[must_use]
    pub fn format_for_prompt(&self) -> String {
        let mut s = String::from("## Repository (git)\n\n");
        let _ = writeln!(&mut s, "- **Branch:** `{}`", self.branch);
        if self.porcelain.trim().is_empty() {
            s.push_str("\n**Status:** clean (no porcelain output)\n");
        } else {
            s.push_str("\n**Status (porcelain):**\n```text\n");
            s.push_str(self.porcelain.trim_end());
            s.push_str("\n```\n");
        }
        if !self.recent_commits.is_empty() {
            s.push_str("\n**Recent commits:**\n```text\n");
            s.push_str(&self.recent_commits.join("\n"));
            s.push_str("\n```\n");
        }
        s
    }
}

fn run_git(workspace: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .current_dir(workspace)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Returns `None` if `workspace` is not a git work tree or git is unavailable.
pub fn capture_git_snapshot(workspace: &Path, max_log: usize) -> Option<GitSnapshot> {
    let check = Command::new("git")
        .current_dir(workspace)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .ok()?;
    if !check.status.success() {
        return None;
    }
    let inside = String::from_utf8_lossy(&check.stdout);
    if inside.trim() != "true" {
        return None;
    }

    let branch = run_git(workspace, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "(unknown)".to_string());

    let mut porcelain = run_git(workspace, &["status", "--porcelain"]).unwrap_or_default();
    if porcelain.chars().count() > MAX_PORCELAIN_CHARS {
        porcelain = format!(
            "{}…\n(truncated, {}+ chars)",
            porcelain
                .chars()
                .take(MAX_PORCELAIN_CHARS)
                .collect::<String>(),
            MAX_PORCELAIN_CHARS
        );
    }

    let n = max_log.clamp(1, 50);
    let log_out = run_git(
        workspace,
        &[
            "log",
            "-n",
            &n.to_string(),
            "--oneline",
            "--no-decorate",
            "--no-color",
        ],
    )
    .unwrap_or_default();
    let recent_commits: Vec<String> = log_out
        .lines()
        .map(str::trim_end)
        .map(String::from)
        .collect();

    Some(GitSnapshot {
        branch,
        porcelain,
        recent_commits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn snapshot_in_fresh_repo() {
        if !git_available() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        assert!(Command::new("git")
            .args(["init"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());
        fs::write(root.join("f.txt"), b"x").unwrap();
        assert!(Command::new("git")
            .args(["config", "user.email", "t@t.t"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args(["config", "user.name", "t"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args(["add", "f.txt"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());

        let snap = capture_git_snapshot(root, 5).expect("snapshot");
        assert!(!snap.branch.is_empty());
        assert!(!snap.recent_commits.is_empty());
    }

    #[test]
    fn non_repo_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(capture_git_snapshot(tmp.path(), 5).is_none());
    }
}
