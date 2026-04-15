# 变更操作手册

ZeroClaw 常见扩展和修改模式的分步指南。

每个扩展特征的完整代码示例请参见 [extension-examples.md](./extension-examples.zh-CN.md)。

## 添加提供商

- 在 `src/providers/` 中实现 `Provider` 特征。
- 在 `src/providers/mod.rs` 工厂中注册。
- 为工厂接线和错误路径添加聚焦测试。
- 避免提供商特定行为泄漏到共享编排代码中。

## 添加渠道

- 在 `src/channels/` 中实现 `Channel` 特征。
- 保持 `send`、`listen`、`health_check`、输入语义一致。
- 用测试覆盖认证/白名单/健康检查行为。

## 添加工具

- 在 `src/tools/` 中实现带有严格参数 schema 的 `Tool` 特征。
- 验证和清理所有输入。
- 返回结构化的 `ToolResult`；运行时路径中避免 panic。

## 添加外设

- 在 `src/peripherals/` 中实现 `Peripheral` 特征。
- 外设暴露 `tools()` —— 每个工具委托给硬件（GPIO、传感器等）。
- 如有需要，在配置 schema 中注册开发板类型。
- 协议和固件说明请参见 `docs/hardware/hardware-peripherals-design.md`。

## 安全/运行时/网关变更

- 包含威胁/风险说明和回滚策略。
- 为故障模式和边界添加/更新测试或验证证据。
- 保持可观测性有用但不包含敏感信息。
- 对于 `.github/workflows/**` 变更，在 PR 说明中包含 Actions 白名单影响，源变更时更新 `docs/contributing/actions-source-policy.md`。

## 文档系统/README/信息架构变更

- 将文档导航视为产品 UX：保持从 README → 文档中心 → SUMMARY → 分类索引的清晰路径。
- 保持顶层导航简洁；避免相邻导航块之间的重复链接。
- 运行时表面变更时，更新 `docs/reference/` 中的相关参考。
- 导航或关键措辞变更时，保持所有支持的语言（`en`、`zh-CN`、`ja`、`ru`、`fr`、`vi`）的多语言入口点一致。
- 共享文档措辞变更时，在同一个 PR 中同步对应的本地化文档（或显式记录延迟更新和后续 PR）。

## 智能体工具循环、QueryEngine 与钩子

- **单一工具路径：** `src/agent/loop_.rs` 中的 `run_tool_call_loop` 始终经 `src/agent/query_engine.rs` 的 `run_query_loop` 进入，后者记录 [`TransitionReason`](../../../../src/agent/state.rs) 诊断信息，并在成功结束时运行**并行 + 阻塞**的回合后钩子（`src/agent/stop_hooks.rs`）。**没有** `query_engine_v2` Cargo 特性；该路径始终开启。
- **压缩：** LLM 调用前的裁剪使用 `src/agent/compaction_pipeline.rs`（命名阶段 + `history_pruner`）；从循环接入的上下文类重试使用同一模块的辅助函数。
- **系统提示：** 规范组装位于 `src/agent/system_prompt.rs`（可记忆化的静态前缀 + 易变尾部；`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 用于分段）。`src/channels/mod.rs` 的 `build_system_prompt_*` 转发至此；部分路径向 `run_tool_call_loop` 传入 `system_prompt_refresh`，使 `src/agent/loop_.rs` 在 `run_pre_llm_phases` 之后更新 `history[0]`。`src/providers/anthropic.rs` 按该标记拆成两个 system 块以支持提示缓存。进程内统计：`crate::agent::query_engine::last_system_prompt_assembly` 与 `zeroclaw doctor query-engine`。
- **转录优先：** 会话 JSONL 的用户行应在模型工作之前于编排边界通过 `session_transcript::commit_user_turn` 落盘（渠道与 `Agent::turn` / `turn_streamed` 遵循此模式）。
- **钩子运行器构建：** `crate::hooks::hook_runner_from_config`（`src/hooks/mod.rs`）在 `[hooks].enabled` 时注册内置钩子；只要 `memory.auto_save` 为 true 即注册 **`MemoryConsolidationHook`**（即使钩子总开关关闭），从而避免在渠道侧重复 `tokio::spawn` 合并逻辑。
- **网关：** 在 `run_gateway` 中构建 `HookRunner`，存入 `AppState.hooks`，并将 `state.hooks.clone()` 传入 `Agent::from_config_with_hooks`，使 `/ws/chat` 的回合后钩子与渠道行为一致。
- **流式回合 sink：** `run_tool_call_loop` / `run_query_loop` 可选传入 `turn_event_sink`（`Sender<TurnEventSink>`）：[`TurnEventSink::DeltaText`](../../../../src/agent/agent.rs) 承载工具循环草稿与进度字符串；[`TurnEventSink::Emit`](../../../../src/agent/agent.rs) 包装 [`TurnEvent`](../../../../src/agent/agent.rs) 以传递模型片段与工具遥测。`Agent::turn_streamed` 使用同一类型；[`src/gateway/ws.rs`](../../../../src/gateway/ws.rs) 将二者映射为 WebSocket JSON（`chunk`、`tool_call`、`tool_result`，随后 `chunk_reset` 与 `done`）。面向用户的协议说明见 [`.claude/skills/zeroclaw/references/rest-api.md`](../../../../.claude/skills/zeroclaw/references/rest-api.md)。
- **扩展回合后行为：** 实现 `HookHandler::on_after_turn_completed` / `after_turn_completed_blocking`（参数为 `user_message` 与 `assistant_summary`）；在与网关或渠道相同的 `HookRunner` 上注册。

## 架构边界规则

- 优先通过添加特征实现 + 工厂接线来扩展功能；避免为孤立功能进行跨模块重写。
- 保持依赖方向向内指向契约：具体集成依赖于特征/配置/工具层，而不是其他具体集成。
- 避免跨子系统耦合（例如提供商代码导入渠道内部实现，工具代码直接修改网关策略）。
- 保持模块职责单一：编排在 `agent/`、传输在 `channels/`、模型 I/O 在 `providers/`、策略在 `security/`、执行在 `tools/`。
- 仅在重复使用至少三次后（三原则）才引入新的共享抽象，且至少有一个真实调用者。
- 对于配置/schema 变更，将键视为公共契约：记录默认值、兼容性影响和迁移/回滚路径。
