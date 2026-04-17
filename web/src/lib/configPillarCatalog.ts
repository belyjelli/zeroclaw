export const CONFIG_PILLAR_IDS = ['llm', 'security', 'agent', 'memory', 'runtime'] as const;
export type ConfigPillarId = (typeof CONFIG_PILLAR_IDS)[number];

export type PillarFieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'slider'
  | 'string_list';

export interface PillarFieldDef {
  /** Stable id for i18n: `config.field.<id>` and optional `config.fieldtip.<id>` */
  id: string;
  path: string[];
  kind: PillarFieldKind;
  /** Only when `kind === 'enum'` */
  enumValues?: readonly string[];
  /** For `kind === 'slider'` (temperature-style floats). */
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  /** For `kind === 'enum'`: wide lists stay as `<select>`, short lists use pill buttons. */
  enumStyle?: 'select' | 'segmented';
  /** For `kind === 'string_list'`: max entries (safety). */
  listMaxItems?: number;
}

export const PILLAR_FIELDS: Record<ConfigPillarId, PillarFieldDef[]> = {
  llm: [
    { id: 'default_provider', path: ['default_provider'], kind: 'string' },
    { id: 'default_model', path: ['default_model'], kind: 'string' },
    {
      id: 'default_temperature',
      path: ['default_temperature'],
      kind: 'slider',
      sliderMin: 0,
      sliderMax: 2,
      sliderStep: 0.05,
    },
    { id: 'provider_timeout_secs', path: ['provider_timeout_secs'], kind: 'number' },
    { id: 'locale', path: ['locale'], kind: 'string' },
    { id: 'native_tool_calling', path: ['native_tool_calling'], kind: 'boolean' },
    { id: 'cost_enabled', path: ['cost', 'enabled'], kind: 'boolean' },
    { id: 'cost_allow_override', path: ['cost', 'allow_override'], kind: 'boolean' },
    { id: 'cost_daily_limit_usd', path: ['cost', 'daily_limit_usd'], kind: 'number' },
    { id: 'cost_monthly_limit_usd', path: ['cost', 'monthly_limit_usd'], kind: 'number' },
    { id: 'cost_warn_at_percent', path: ['cost', 'warn_at_percent'], kind: 'number' },
    { id: 'reliability_provider_retries', path: ['reliability', 'provider_retries'], kind: 'number' },
    { id: 'reliability_provider_backoff_ms', path: ['reliability', 'provider_backoff_ms'], kind: 'number' },
    { id: 'reliability_channel_max_backoff_secs', path: ['reliability', 'channel_max_backoff_secs'], kind: 'number' },
  ],
  security: [
    {
      id: 'autonomy_level',
      path: ['autonomy', 'level'],
      kind: 'enum',
      enumValues: ['readonly', 'supervised', 'full'],
      enumStyle: 'segmented',
    },
    { id: 'autonomy_workspace_only', path: ['autonomy', 'workspace_only'], kind: 'boolean' },
    {
      id: 'autonomy_allowed_commands',
      path: ['autonomy', 'allowed_commands'],
      kind: 'string_list',
      listMaxItems: 256,
    },
    {
      id: 'autonomy_forbidden_paths',
      path: ['autonomy', 'forbidden_paths'],
      kind: 'string_list',
      listMaxItems: 256,
    },
    {
      id: 'autonomy_auto_approve',
      path: ['autonomy', 'auto_approve'],
      kind: 'string_list',
      listMaxItems: 256,
    },
    { id: 'autonomy_max_actions_per_hour', path: ['autonomy', 'max_actions_per_hour'], kind: 'number' },
    { id: 'autonomy_max_cost_per_day_cents', path: ['autonomy', 'max_cost_per_day_cents'], kind: 'number' },
    {
      id: 'autonomy_require_approval_for_medium_risk',
      path: ['autonomy', 'require_approval_for_medium_risk'],
      kind: 'boolean',
    },
    { id: 'autonomy_block_high_risk_commands', path: ['autonomy', 'block_high_risk_commands'], kind: 'boolean' },
    { id: 'security_sandbox_enabled', path: ['security', 'sandbox', 'enabled'], kind: 'boolean' },
    {
      id: 'security_sandbox_backend',
      path: ['security', 'sandbox', 'backend'],
      kind: 'enum',
      enumValues: ['auto', 'landlock', 'firejail', 'bubblewrap', 'docker', 'none'],
      enumStyle: 'select',
    },
    { id: 'security_resources_max_memory_mb', path: ['security', 'resources', 'max_memory_mb'], kind: 'number' },
    { id: 'security_resources_max_cpu_time_seconds', path: ['security', 'resources', 'max_cpu_time_seconds'], kind: 'number' },
    { id: 'security_resources_max_subprocesses', path: ['security', 'resources', 'max_subprocesses'], kind: 'number' },
    { id: 'security_resources_memory_monitoring', path: ['security', 'resources', 'memory_monitoring'], kind: 'boolean' },
    { id: 'security_audit_enabled', path: ['security', 'audit', 'enabled'], kind: 'boolean' },
    { id: 'security_otp_enabled', path: ['security', 'otp', 'enabled'], kind: 'boolean' },
    {
      id: 'security_otp_gated_actions',
      path: ['security', 'otp', 'gated_actions'],
      kind: 'string_list',
      listMaxItems: 128,
    },
    { id: 'security_estop_enabled', path: ['security', 'estop', 'enabled'], kind: 'boolean' },
    { id: 'secrets_encrypt', path: ['secrets', 'encrypt'], kind: 'boolean' },
    { id: 'security_ops_enabled', path: ['security_ops', 'enabled'], kind: 'boolean' },
  ],
  agent: [
    { id: 'agent_compact_context', path: ['agent', 'compact_context'], kind: 'boolean' },
    {
      id: 'agent_thinking_default_level',
      path: ['agent', 'thinking', 'default_level'],
      kind: 'enum',
      enumValues: ['off', 'minimal', 'low', 'medium', 'high', 'max'],
      enumStyle: 'select',
    },
    { id: 'agent_max_tool_iterations', path: ['agent', 'max_tool_iterations'], kind: 'number' },
    { id: 'agent_max_history_messages', path: ['agent', 'max_history_messages'], kind: 'number' },
    { id: 'agent_max_context_tokens', path: ['agent', 'max_context_tokens'], kind: 'number' },
    { id: 'agent_parallel_tools', path: ['agent', 'parallel_tools'], kind: 'boolean' },
    {
      id: 'agent_tool_router_enabled',
      path: ['agent', 'tool_router', 'enabled'],
      kind: 'boolean',
    },
    { id: 'agent_tool_router_timeout_ms', path: ['agent', 'tool_router', 'timeout_ms'], kind: 'number' },
    { id: 'skills_open_skills_enabled', path: ['skills', 'open_skills_enabled'], kind: 'boolean' },
    { id: 'skills_allow_scripts', path: ['skills', 'allow_scripts'], kind: 'boolean' },
    {
      id: 'skills_skill_creation_enabled',
      path: ['skills', 'skill_creation', 'enabled'],
      kind: 'boolean',
    },
    { id: 'pacing_step_timeout_secs', path: ['pacing', 'step_timeout_secs'], kind: 'number' },
    { id: 'pacing_loop_detection_enabled', path: ['pacing', 'loop_detection_enabled'], kind: 'boolean' },
    { id: 'pacing_loop_detection_window_size', path: ['pacing', 'loop_detection_window_size'], kind: 'number' },
    { id: 'pacing_loop_detection_max_repeats', path: ['pacing', 'loop_detection_max_repeats'], kind: 'number' },
    { id: 'heartbeat_enabled', path: ['heartbeat', 'enabled'], kind: 'boolean' },
    { id: 'heartbeat_interval_minutes', path: ['heartbeat', 'interval_minutes'], kind: 'number' },
  ],
  memory: [
    { id: 'memory_backend', path: ['memory', 'backend'], kind: 'string' },
    { id: 'memory_auto_save', path: ['memory', 'auto_save'], kind: 'boolean' },
    { id: 'memory_hygiene_enabled', path: ['memory', 'hygiene_enabled'], kind: 'boolean' },
    { id: 'memory_archive_after_days', path: ['memory', 'archive_after_days'], kind: 'number' },
    { id: 'memory_purge_after_days', path: ['memory', 'purge_after_days'], kind: 'number' },
    { id: 'memory_conversation_retention_days', path: ['memory', 'conversation_retention_days'], kind: 'number' },
    { id: 'memory_embedding_provider', path: ['memory', 'embedding_provider'], kind: 'string' },
    { id: 'memory_embedding_model', path: ['memory', 'embedding_model'], kind: 'string' },
    { id: 'memory_min_relevance_score', path: ['memory', 'min_relevance_score'], kind: 'number' },
    { id: 'memory_layered_enabled', path: ['memory', 'layered', 'enabled'], kind: 'boolean' },
    { id: 'backup_enabled', path: ['backup', 'enabled'], kind: 'boolean' },
    { id: 'backup_max_keep', path: ['backup', 'max_keep'], kind: 'number' },
    { id: 'data_retention_enabled', path: ['data_retention', 'enabled'], kind: 'boolean' },
    { id: 'knowledge_enabled', path: ['knowledge', 'enabled'], kind: 'boolean' },
  ],
  runtime: [
    {
      id: 'runtime_kind',
      path: ['runtime', 'kind'],
      kind: 'enum',
      enumValues: ['native', 'docker'],
      enumStyle: 'segmented',
    },
    {
      id: 'runtime_docker_network',
      path: ['runtime', 'docker', 'network'],
      kind: 'enum',
      enumValues: ['none', 'bridge', 'host'],
      enumStyle: 'segmented',
    },
    { id: 'runtime_docker_image', path: ['runtime', 'docker', 'image'], kind: 'string' },
    { id: 'runtime_docker_memory_limit_mb', path: ['runtime', 'docker', 'memory_limit_mb'], kind: 'number' },
    { id: 'runtime_docker_cpu_limit', path: ['runtime', 'docker', 'cpu_limit'], kind: 'number' },
    { id: 'runtime_docker_read_only_rootfs', path: ['runtime', 'docker', 'read_only_rootfs'], kind: 'boolean' },
    { id: 'gateway_port', path: ['gateway', 'port'], kind: 'number' },
    { id: 'gateway_host', path: ['gateway', 'host'], kind: 'string' },
    { id: 'gateway_require_pairing', path: ['gateway', 'require_pairing'], kind: 'boolean' },
    { id: 'channels_config_cli', path: ['channels_config', 'cli'], kind: 'boolean' },
    { id: 'channels_config_show_tool_calls', path: ['channels_config', 'show_tool_calls'], kind: 'boolean' },
    { id: 'channels_config_session_backend', path: ['channels_config', 'session_backend'], kind: 'string' },
    { id: 'channels_config_message_timeout_secs', path: ['channels_config', 'message_timeout_secs'], kind: 'number' },
    { id: 'scheduler_enabled', path: ['scheduler', 'enabled'], kind: 'boolean' },
    { id: 'cron_enabled', path: ['cron', 'enabled'], kind: 'boolean' },
    { id: 'mcp_enabled', path: ['mcp', 'enabled'], kind: 'boolean' },
    { id: 'mcp_deferred_loading', path: ['mcp', 'deferred_loading'], kind: 'boolean' },
    { id: 'mcp_serve_http_port', path: ['mcp_serve', 'http_port'], kind: 'number' },
    { id: 'mcp_serve_tool_timeout_secs', path: ['mcp_serve', 'tool_timeout_secs'], kind: 'number' },
    { id: 'hooks_enabled', path: ['hooks', 'enabled'], kind: 'boolean' },
    { id: 'node_transport_enabled', path: ['node_transport', 'enabled'], kind: 'boolean' },
    { id: 'shell_tool_timeout_secs', path: ['shell_tool', 'timeout_secs'], kind: 'number' },
    { id: 'browser_enabled', path: ['browser', 'enabled'], kind: 'boolean' },
    { id: 'browser_backend', path: ['browser', 'backend'], kind: 'string' },
    {
      id: 'browser_allowed_domains',
      path: ['browser', 'allowed_domains'],
      kind: 'string_list',
      listMaxItems: 128,
    },
    { id: 'http_request_enabled', path: ['http_request', 'enabled'], kind: 'boolean' },
    {
      id: 'http_request_allowed_domains',
      path: ['http_request', 'allowed_domains'],
      kind: 'string_list',
      listMaxItems: 128,
    },
    { id: 'http_request_timeout_secs', path: ['http_request', 'timeout_secs'], kind: 'number' },
    {
      id: 'http_request_allow_private_hosts',
      path: ['http_request', 'allow_private_hosts'],
      kind: 'boolean',
    },
    { id: 'web_fetch_enabled', path: ['web_fetch', 'enabled'], kind: 'boolean' },
    {
      id: 'web_fetch_allowed_domains',
      path: ['web_fetch', 'allowed_domains'],
      kind: 'string_list',
      listMaxItems: 128,
    },
    { id: 'web_fetch_timeout_secs', path: ['web_fetch', 'timeout_secs'], kind: 'number' },
    { id: 'web_search_enabled', path: ['web_search', 'enabled'], kind: 'boolean' },
    {
      id: 'web_search_provider',
      path: ['web_search', 'provider'],
      kind: 'enum',
      enumValues: ['duckduckgo', 'brave', 'searxng'],
      enumStyle: 'select',
    },
    { id: 'web_search_max_results', path: ['web_search', 'max_results'], kind: 'number' },
    { id: 'text_browser_enabled', path: ['text_browser', 'enabled'], kind: 'boolean' },
    { id: 'composio_enabled', path: ['composio', 'enabled'], kind: 'boolean' },
    { id: 'observability_backend', path: ['observability', 'backend'], kind: 'string' },
  ],
};
