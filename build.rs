use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

fn main() {
    let dist_dir = Path::new("web/dist");
    let web_dir = Path::new("web");

    // Tell Cargo to re-run this script when web sources or bundled assets change.
    println!("cargo:rerun-if-changed=web/src");
    println!("cargo:rerun-if-changed=web/public");
    println!("cargo:rerun-if-changed=web/index.html");
    println!("cargo:rerun-if-changed=docs/assets/zeroclaw-trans.png");
    println!("cargo:rerun-if-changed=web/package.json");
    println!("cargo:rerun-if-changed=web/bun.lock");
    println!("cargo:rerun-if-changed=web/tsconfig.json");
    println!("cargo:rerun-if-changed=web/tsconfig.app.json");
    println!("cargo:rerun-if-changed=web/tsconfig.node.json");
    println!("cargo:rerun-if-changed=web/vite.config.ts");
    println!("cargo:rerun-if-changed=web/dist");

    // Attempt to build the web frontend if Bun is available and web/dist is
    // missing or stale. The build is best-effort: when Bun is not installed
    // (e.g. CI containers, cross-compilation, minimal dev setups) we fall
    // back to the existing stub/empty dist directory so the Rust build still
    // succeeds.
    let needs_build = web_build_required(web_dir, dist_dir);

    if needs_build && web_dir.join("package.json").exists() {
        if let Ok(bun) = which_bun() {
            eprintln!("cargo:warning=Building web frontend (web/dist is missing or stale)...");

            let install_status = Command::new(&bun)
                .args(["install", "--frozen-lockfile"])
                .current_dir(web_dir)
                .status();

            match install_status {
                Ok(s) if s.success() => {}
                Ok(s) => {
                    eprintln!(
                        "cargo:warning=bun install --frozen-lockfile exited with {s}, trying bun install..."
                    );
                    let fallback = Command::new(&bun)
                        .args(["install"])
                        .current_dir(web_dir)
                        .status();
                    if !matches!(fallback, Ok(s) if s.success()) {
                        eprintln!("cargo:warning=bun install failed — skipping web build");
                        ensure_dist_dir(dist_dir);
                        return;
                    }
                }
                Err(e) => {
                    eprintln!("cargo:warning=Could not run bun: {e} — skipping web build");
                    ensure_dist_dir(dist_dir);
                    return;
                }
            }

            let build_status = Command::new(&bun)
                .args(["run", "build"])
                .current_dir(web_dir)
                .status();

            match build_status {
                Ok(s) if s.success() => {
                    eprintln!("cargo:warning=Web frontend built successfully.");
                }
                Ok(s) => {
                    eprintln!(
                        "cargo:warning=bun run build exited with {s} — web dashboard may be unavailable"
                    );
                }
                Err(e) => {
                    eprintln!(
                        "cargo:warning=Could not run bun build: {e} — web dashboard may be unavailable"
                    );
                }
            }
        }
    }

    ensure_dist_dir(dist_dir);
    ensure_dashboard_assets(dist_dir);
}

fn web_build_required(web_dir: &Path, dist_dir: &Path) -> bool {
    let Some(dist_mtime) = latest_modified(dist_dir) else {
        return true;
    };

    [
        web_dir.join("src"),
        web_dir.join("public"),
        web_dir.join("index.html"),
        web_dir.join("package.json"),
        web_dir.join("bun.lock"),
        web_dir.join("tsconfig.json"),
        web_dir.join("tsconfig.app.json"),
        web_dir.join("tsconfig.node.json"),
        web_dir.join("vite.config.ts"),
    ]
    .into_iter()
    .filter_map(|path| latest_modified(&path))
    .any(|mtime| mtime > dist_mtime)
}

fn latest_modified(path: &Path) -> Option<SystemTime> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.is_file() {
        return metadata.modified().ok();
    }
    if !metadata.is_dir() {
        return None;
    }

    let mut latest = metadata.modified().ok();
    let entries = fs::read_dir(path).ok()?;
    for entry in entries.flatten() {
        if let Some(child_mtime) = latest_modified(&entry.path()) {
            latest = Some(match latest {
                Some(current) if current >= child_mtime => current,
                _ => child_mtime,
            });
        }
    }
    latest
}

/// Ensure the dist directory exists so `rust-embed` does not fail at compile
/// time even when the web frontend is not built.
fn ensure_dist_dir(dist_dir: &Path) {
    if !dist_dir.exists() {
        std::fs::create_dir_all(dist_dir).expect("failed to create web/dist/");
    }
}

fn ensure_dashboard_assets(dist_dir: &Path) {
    // The Rust gateway serves `web/dist/` via rust-embed under `/_app/*`.
    // Some builds may end up with missing/blank logo assets, so we ensure the
    // expected image is always present in `web/dist/` at compile time.
    let src = Path::new("docs/assets/zeroclaw-trans.png");
    if !src.exists() {
        eprintln!(
            "cargo:warning=docs/assets/zeroclaw-trans.png not found; skipping dashboard asset copy"
        );
        return;
    }

    let dst = dist_dir.join("zeroclaw-trans.png");
    if let Err(e) = fs::copy(src, &dst) {
        eprintln!("cargo:warning=Failed to copy zeroclaw-trans.png into web/dist/: {e}");
    }
}

/// Locate the `bun` binary on the system PATH.
fn which_bun() -> Result<String, ()> {
    let cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    Command::new(cmd)
        .arg("bun")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.lines().next().unwrap_or("bun").trim().to_string())
            } else {
                None
            }
        })
        .ok_or(())
}
