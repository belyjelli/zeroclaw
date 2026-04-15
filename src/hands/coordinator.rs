//! Coordinator mode for hands: deterministic phased workers, forked prompt context, scratchpad.

use std::collections::HashSet;
use std::fmt::Write as _;
use std::path::Path;

use anyhow::{bail, Context, Result};

use crate::agent::system_prompt::{assemble_once, PromptAssemblyContext, SystemPrompt};
use crate::agent::{query_engine, Agent};
use crate::config::Config;
use crate::context::DynamicContextPaths;
use crate::security::SecurityPolicy;

use super::load_hand_context;
use super::types::{CoordinatorMode, Hand, HandContext};
use super::{ensure_scratchpad_dir, scratchpad_dir_for_hand};

fn append_decision(scratchpad: &Path, line: &str) -> Result<()> {
    let path = scratchpad.join("decisions.md");
    let stamp = chrono::Utc::now().to_rfc3339();
    let mut prev = if path.exists() {
        std::fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };
    if !prev.is_empty() && !prev.ends_with('\n') {
        prev.push('\n');
    }
    let _ = writeln!(&mut prev, "- [{stamp}] {line}");
    std::fs::write(&path, prev).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    format!("{}… [truncated]", &s[..end])
}

/// Default tool candidates per coordinator phase (intersected with the hand allowlist and registry).
fn phase_default_tool_names(phase: &str) -> &'static [&'static str] {
    match phase {
        "research" => &[
            "file_read",
            "memory_recall",
            "memory_store",
            "web_search_tool",
            "http_request",
            "web_fetch",
        ],
        "synthesis" => &["file_read", "memory_recall", "file_write", "memory_store"],
        "implementation" => &["file_read", "file_write", "shell", "memory_store"],
        "verification" => &["file_read", "shell", "memory_recall"],
        _ => &["file_read"],
    }
}

fn pick_worker_tool_names(
    phase: &str,
    hand: &Hand,
    registry: &[Box<dyn crate::tools::Tool>],
) -> Vec<String> {
    let reg: HashSet<&str> = registry.iter().map(|t| t.name()).collect();
    let mut names: Vec<String> = phase_default_tool_names(phase)
        .iter()
        .filter(|n| reg.contains(*n))
        .map(|s| (*s).to_string())
        .collect();

    if let Some(allowed) = hand.allowed_tools.as_ref() {
        let allow: HashSet<&str> = allowed.iter().map(String::as_str).collect();
        names.retain(|n| allow.contains(n.as_str()));
    }

    if names.is_empty() {
        if reg.contains("file_read") {
            if tool_ok_for_hand(hand.allowed_tools.as_deref(), "file_read") {
                names.push("file_read".into());
            }
        }
    }
    names
}

fn tool_ok_for_hand(allowed: Option<&[String]>, tool_name: &str) -> bool {
    match allowed {
        None => true,
        Some(list) => list.iter().any(|x| x == tool_name),
    }
}

fn hand_allow_slice(hand: &Hand) -> Option<&[String]> {
    hand.allowed_tools.as_ref().map(Vec::as_slice)
}

fn all_hand_tool_names(hand: &Hand, registry: &[Box<dyn crate::tools::Tool>]) -> Vec<String> {
    registry
        .iter()
        .map(|t| t.name().to_string())
        .filter(|n| tool_ok_for_hand(hand_allow_slice(hand), n))
        .collect()
}

fn assemble_parent_prompt(config: &Config, agent: &Agent, hand: &Hand) -> Result<SystemPrompt> {
    let security = SecurityPolicy::from_config(&config.autonomy, &config.workspace_dir);
    let security_summary = security.prompt_summary();
    let skills = crate::skills::load_skills_with_config(&config.workspace_dir, config);
    let user_zc = crate::context::default_user_zeroclaw_dir();
    let dynamic_paths = DynamicContextPaths {
        global_config_dir: None,
        user_config_dir: user_zc.as_deref(),
        session_dir: None,
    };

    let owned_descriptions: Vec<(String, String)> = agent
        .tools_registry()
        .iter()
        .filter(|t| tool_ok_for_hand(hand_allow_slice(hand), t.name()))
        .map(|t| (t.name().to_string(), t.description().to_string()))
        .collect();
    let pair_refs: Vec<(&str, &str)> = owned_descriptions
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();

    let model = hand
        .model
        .as_deref()
        .unwrap_or_else(|| agent.model_name_str());

    let ctx = PromptAssemblyContext {
        workspace_dir: &config.workspace_dir,
        model_name: model,
        tools: &pair_refs,
        skills: &skills,
        identity_config: Some(&config.identity),
        bootstrap_max_chars: if config.agent.compact_context {
            Some(6000)
        } else {
            None
        },
        autonomy_config: Some(&config.autonomy),
        native_tools: agent.provider_ref().supports_native_tools(),
        skills_prompt_mode: config.skills.prompt_injection_mode,
        compact_context: config.agent.compact_context,
        max_system_prompt_chars: config.agent.max_system_prompt_chars,
        dynamic_context: Some(&config.agent.dynamic_context),
        dynamic_paths,
        static_suffix: "",
        dispatcher_instructions: None,
        security_summary: Some(security_summary.as_str()),
        include_channel_media: false,
        layered_memory_markdown: None,
    };

    assemble_once(&ctx)
}

fn context_digest(ctx: &HandContext) -> String {
    let mut s = String::new();
    if !ctx.learned_facts.is_empty() {
        let _ = writeln!(&mut s, "### Learned facts\n");
        for f in ctx.learned_facts.iter().take(40) {
            let _ = writeln!(&mut s, "- {f}");
        }
    }
    if let Some(r) = ctx.history.first() {
        let _ = writeln!(
            &mut s,
            "\n### Last run\nstatus: {:?}\nfindings: {:?}",
            r.status, r.findings
        );
    }
    s
}

fn pipeline_phases(mode: CoordinatorMode) -> Vec<(&'static str, &'static str)> {
    match mode {
        CoordinatorMode::Disabled => Vec::new(),
        CoordinatorMode::Enabled => vec![
            ("research", "research.md"),
            ("synthesis", "synthesis.md"),
            ("implementation", "implementation.md"),
            ("verification", "verification.md"),
        ],
        CoordinatorMode::ResearchOnly => {
            vec![("research", "research.md"), ("synthesis", "synthesis.md")]
        }
        CoordinatorMode::ExecutionOnly => vec![
            ("synthesis", "synthesis.md"),
            ("implementation", "implementation.md"),
            ("verification", "verification.md"),
        ],
    }
}

fn worker_goal_for_phase(
    phase: &str,
    rel: &str,
    hand: &Hand,
    scratchpad: &Path,
    ctx: &HandContext,
) -> String {
    let sp = scratchpad.display().to_string();
    let digest = context_digest(ctx);
    match phase {
        "research" => format!(
            "Hand `{}` — research phase.\n\n## Mission\n{}\n\n## Knowledge lines\n{}\n\n## Rolling context\n{digest}\n\nWrite durable notes to `{sp}/{rel}` (the coordinator will persist your final reply there too).",
            hand.name,
            hand.prompt,
            hand.knowledge.join("\n"),
            digest = digest,
            sp = sp,
            rel = rel,
        ),
        "synthesis" => format!(
            "Synthesis phase for hand `{}`. Read `{sp}/research.md` if it exists. Produce a consolidated plan in `{sp}/{rel}`.\n\n{digest}",
            hand.name,
            sp = sp,
            rel = rel,
            digest = digest
        ),
        "implementation" => format!(
            "Implementation phase for hand `{}`. Read `{sp}/synthesis.md` and prior notes. Execute concrete steps; document results for `{sp}/{rel}`.\n\n{digest}",
            hand.name,
            sp = sp,
            rel = rel,
            digest = digest
        ),
        "verification" => format!(
            "Verification phase for hand `{}`. Read `{sp}/implementation.md` and related files under `{sp}`. Report pass/fail and risks in `{sp}/{rel}`.\n\n{digest}",
            hand.name,
            sp = sp,
            rel = rel,
            digest = digest
        ),
        _ => format!(
            "Worker phase {phase}. Scratchpad: {sp}/{rel}\n\n{digest}",
            sp = sp,
            rel = rel,
            digest = digest,
        ),
    }
}

/// Run one hand using coordinator mode (or a single worker-style turn when [`CoordinatorMode::Disabled`]).
pub async fn run_coordinator_hand(
    config: &Config,
    hands_dir: &Path,
    hand: &Hand,
) -> Result<String> {
    let zdir = crate::context::default_user_zeroclaw_dir()
        .context("HOME / ~/.zeroclaw not available for scratchpad")?;
    let scratchpad = ensure_scratchpad_dir(&zdir, &hand.name)?;
    let hand_ctx = load_hand_context(hands_dir, &hand.name)?;

    let agent = Agent::from_config(config).await?;

    let parent_sp = assemble_parent_prompt(config, &agent, hand)?;

    let model = hand
        .model
        .as_deref()
        .unwrap_or_else(|| agent.model_name_str());
    let provider_name = agent.provider_label_str();
    let obs = agent.observer();

    if matches!(hand.coordinator_mode, CoordinatorMode::Disabled) {
        query_engine::record_transition(
            crate::agent::state::TransitionReason::CoordinatorModeActive,
            Some(format!("hand={} mode=disabled single_turn", hand.name)),
        );
        query_engine::set_last_coordinator_summary(Some(
            "Coordinator: single-turn hand run (coordinator_mode = disabled)".into(),
        ));
        let names = all_hand_tool_names(hand, agent.tools_registry());
        let goal = format!(
            "{}\n\n## Knowledge\n{}\n\n## Context\n{}",
            hand.prompt,
            hand.knowledge.join("\n"),
            context_digest(&hand_ctx)
        );
        let out = query_engine::run_worker_fork(
            config,
            agent.provider_ref(),
            provider_name,
            model,
            agent.temperature(),
            &parent_sp,
            "(single-turn hand; no prior coordinator summary.)",
            &goal,
            &names,
            hand_allow_slice(hand),
            agent.tools_registry(),
            obs.as_ref(),
            &hand.name,
            "single",
            config.agent.max_tool_iterations,
        )
        .await?;
        append_decision(
            &scratchpad,
            &format!("single_turn completed; chars={}", out.final_text.len()),
        )?;
        return Ok(out.final_text);
    }

    query_engine::record_transition(
        crate::agent::state::TransitionReason::CoordinatorModeActive,
        Some(format!(
            "hand={} mode={:?}",
            hand.name, hand.coordinator_mode
        )),
    );
    query_engine::set_last_coordinator_summary(Some(format!(
        "Coordinator mode active — hand `{}` ({:?})",
        hand.name, hand.coordinator_mode
    )));
    append_decision(
        &scratchpad,
        &format!("start coordinator_mode={:?}", hand.coordinator_mode),
    )?;

    let phases = pipeline_phases(hand.coordinator_mode);
    if phases.is_empty() {
        bail!("coordinator pipeline empty");
    }
    let last_rel = phases.last().map(|p| p.1).unwrap_or("verification.md");

    let mut parent_summary = format!(
        "Hand: {}\nDescription: {}\nMission: {}",
        hand.name, hand.description, hand.prompt
    );

    let mut last_out = String::new();

    for (phase, rel) in &phases {
        let tool_names = pick_worker_tool_names(*phase, hand, agent.tools_registry());
        if tool_names.is_empty() {
            bail!(
                "no tools available for phase {} (check hand allowed_tools)",
                phase
            );
        }
        let goal = worker_goal_for_phase(*phase, rel, hand, &scratchpad, &hand_ctx);
        let max_it = (24usize).min(config.agent.max_tool_iterations.max(1));

        let spec_line = format!("phase={} tools={}", phase, tool_names.join(","));
        append_decision(&scratchpad, &spec_line)?;

        let out = query_engine::run_worker_fork(
            config,
            agent.provider_ref(),
            provider_name,
            model,
            agent.temperature(),
            &parent_sp,
            &parent_summary,
            &goal,
            &tool_names,
            hand_allow_slice(hand),
            agent.tools_registry(),
            obs.as_ref(),
            &hand.name,
            *phase,
            max_it,
        )
        .await?;

        let path = scratchpad.join(rel);
        std::fs::write(&path, &out.final_text)
            .with_context(|| format!("failed to write {}", path.display()))?;

        let _ = write!(
            &mut parent_summary,
            "\n\n## Worker {phase}\n{}",
            truncate(&out.final_text, 6000)
        );
        last_out = out.final_text;
    }

    append_decision(&scratchpad, "coordinator pipeline completed")?;
    query_engine::set_last_coordinator_summary(Some(format!(
        "Coordinator: finished all phases for hand `{}`",
        hand.name
    )));

    let summary_path = scratchpad.join("final_summary.md");
    std::fs::write(&summary_path, &last_out)
        .with_context(|| format!("failed to write {}", summary_path.display()))?;

    Ok(format!(
        "Coordinator finished for hand `{}`. Scratchpad: {}\nLast phase output written to {} and {}.",
        hand.name,
        scratchpad_dir_for_hand(&zdir, &hand.name).display(),
        scratchpad.join(last_rel).display(),
        summary_path.display()
    ))
}
