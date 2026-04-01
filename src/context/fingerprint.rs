//! Stable fingerprint for memoization invalidation when instruction files or git HEAD change.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::time::SystemTime;

/// Hash token for cache keys; cheap to compare.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ContextFingerprint(pub u64);

/// Collects `(path, modified time)` for each existing file, then hashes with optional git HEAD.
pub fn compute_fingerprint(
    instruction_files: &[(std::path::PathBuf, Option<SystemTime>)],
    git_head: Option<&str>,
) -> ContextFingerprint {
    let mut hasher = DefaultHasher::new();
    for (path, mtime) in instruction_files {
        path.hash(&mut hasher);
        mtime.hash(&mut hasher);
    }
    git_head.hash(&mut hasher);
    ContextFingerprint(hasher.finish())
}

/// Metadata for fingerprint: existing instruction paths with mtimes (missing files omitted).
pub fn instruction_files_with_mtime(
    paths: &[std::path::PathBuf],
) -> Vec<(std::path::PathBuf, Option<SystemTime>)> {
    let mut out = Vec::new();
    for p in paths {
        if p.is_file() {
            let mtime = std::fs::metadata(p).ok().and_then(|m| m.modified().ok());
            out.push((p.clone(), mtime));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

/// Reads `git rev-parse HEAD` when `workspace` is a git checkout.
pub fn git_head_sha(workspace: &Path) -> Option<String> {
    let output = std::process::Command::new("git")
        .current_dir(workspace)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&output.stdout);
    let trimmed = s.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::time::Duration;

    #[test]
    fn fingerprint_changes_when_file_mtime_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let f = tmp.path().join("t.md");
        fs::write(&f, b"a").unwrap();
        let m1 = std::fs::metadata(&f).unwrap().modified().unwrap();
        let fp1 = compute_fingerprint(&[(f.clone(), Some(m1))], None);
        std::thread::sleep(Duration::from_millis(20));
        let mut file = fs::OpenOptions::new().append(true).open(&f).unwrap();
        file.write_all(b"b").unwrap();
        drop(file);
        let m2 = std::fs::metadata(&f).unwrap().modified().unwrap();
        let fp2 = compute_fingerprint(&[(f, Some(m2))], None);
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn git_head_changes_fingerprint() {
        let a = compute_fingerprint(&[], Some("aaa"));
        let b = compute_fingerprint(&[], Some("bbb"));
        assert_ne!(a, b);
    }
}
