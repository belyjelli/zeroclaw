# 変更プレイブック

ZeroClaw でよくある拡張や変更パターンの手順ガイドです。

各拡張トレイトの完全なコード例は [extension-examples.md](../../../contributing/extension-examples.md) を参照してください。

## プロバイダを追加する

- `src/providers/` で `Provider` を実装する。
- `src/providers/mod.rs` のファクトリに登録する。
- ファクトリ配線とエラー系に絞ったテストを追加する。
- プロバイダ固有の振る舞いが共有オーケストレーションに漏れないようにする。

## チャネルを追加する

- `src/channels/` で `Channel` を実装する。
- `send`、`listen`、`health_check`、タイピングの意味を揃える。
- 認証・許可リスト・ヘルスをテストでカバーする。

## ツールを追加する

- `src/tools/` で厳密なパラメータスキーマ付きの `Tool` を実装する。
- 入力はすべて検証・サニタイズする。
- 構造化された `ToolResult` を返す。実行時パスでは panic を避ける。

## ペリフェラルを追加する

- `src/peripherals/` で `Peripheral` を実装する。
- ペリフェラルは `tools()` を公開し、各ツールがハードウェア（GPIO、センサーなど）に委譲する。
- 必要なら設定スキーマにボード種別を登録する。
- プロトコルとファームウェアの注意は `docs/hardware/hardware-peripherals-design.md` を参照。

## セキュリティ / ランタイム / ゲートウェイの変更

- 脅威・リスクとロールバック方針を書く。
- 失敗モードと境界についてテストまたは検証の根拠を追加・更新する。
- 可観測性は有用だが機微でない情報にとどめる。
- `.github/workflows/**` を変える場合は PR 説明に Actions 許可リストへの影響を含め、ソース変更時は `docs/contributing/actions-source-policy.md` を更新する。

## ドキュメントシステム / README / IA の変更

- ドキュメントのナビはプロダクト UX として扱う: README → ドキュメントハブ → SUMMARY → カテゴリ索引の導線を保つ。
- トップレベルのナビは簡潔にし、隣接ブロック間の重複リンクを避ける。
- ランタイムの表面が変わったら `docs/reference/` の関連参照を更新する。
- ナビや重要な文言を変えるときは、対応する全ロケール（`en`、`zh-CN`、`ja`、`ru`、`fr`、`vi`）の多言語エントリを揃える。
- 共有ドキュメントの文言を変えるときは同一 PR でローカライズを同期する（または延期とフォローアップ PR を明示する）。

## ツール共有状態

- 長寿命の共有状態を持つツールは `Arc<RwLock<T>>` ハンドルパターンに従う。
- ハンドルは構築時に受け取る。グローバル／静的な可変状態を新設しない。
- クライアントごとの状態にはデーモンから渡される `ClientId` で名前空間を分ける。ツール内で身元キーを組み立てない。
- 機微な状態（資格情報、クォータ）はクライアントごとに分離する。ブロードキャスト／表示用の状態は任意で名前空間プレフィックスを付けて共有してよい。
- 設定変更時はキャッシュされた検証は無効化される。シグナル後、次の実行前にツールは再検証しなければならない。
- 完全な契約は [ADR-004: Tool Shared State Ownership](../../../architecture/adr-004-tool-shared-state-ownership.md) を参照。

## エージェントのツールループ、QueryEngine、フック

- **単一ツールパス:** `src/agent/loop_.rs` の `run_tool_call_loop` は常に `src/agent/query_engine.rs` の `run_query_loop` 経由で入り、[`TransitionReason`](../../../../src/agent/state.rs) の診断を記録し、成功時に **`void` + `blocking`** のターン後フックを実行する（`src/agent/stop_hooks.rs`）。`query_engine_v2` という Cargo 機能は**ない**。このパスは常に有効。
- **コンパクション:** LLM 呼び出し前のトリミングは `src/agent/compaction_pipeline.rs`（名前付きステージ + `history_pruner`）。ループから配線された文脈系リトライも同モジュールのヘルパを利用する。
- **システムプロンプト:** 正規の組み立ては `src/agent/system_prompt.rs`（メモ化された静的プレフィックス + 揮発的な末尾。分割用マーカー `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`）。`src/channels/mod.rs` の `build_system_prompt_*` はここに委譲する。一部パスは `run_tool_call_loop` に `system_prompt_refresh` を渡し、`src/agent/loop_.rs` が `run_pre_llm_phases` の後に `history[0]` を更新する。`src/providers/anthropic.rs` はそのマーカーをプロンプトキャッシュ用に 2 つの system ブロックへ写し替える。プロセス内統計: `crate::agent::query_engine::last_system_prompt_assembly` と `zeroclaw doctor query-engine`（`[memory.layered]` 使用時はレイヤードメモリ選択の統計も表示）。
- **トランスクリプト優先:** セッション JSONL のユーザ行はモデル処理の前に、オーケストレーション境界で `session_transcript::commit_user_turn` によりコミットする（チャネルと `Agent::turn` / `turn_streamed` がこのパターンに従う）。
- **フックランナー構築:** `crate::hooks::hook_runner_from_config`（`src/hooks/mod.rs`）は `[hooks].enabled` のとき設定どおりのビルトインを登録し、`memory.auto_save` が true のときはフック全体がオフでも **`MemoryConsolidationHook`** を登録する（チャネル側で `tokio::spawn` を重複させないため）。`[memory.layered]` 有効時はレイヤード SessionMemory / AutoMemory のファイル書き込みを `src/memory/consolidation.rs`（同一 `tokio::spawn`）に載せる。`tokio::spawn` を跨ぐ保留ターンは `src/memory/layered_context.rs`。
- **ゲートウェイ:** `run_gateway` で `HookRunner` を構築し `AppState.hooks` に保持し、`state.hooks.clone()` を `Agent::from_config_with_hooks` に渡して `/ws/chat` のターン後フックをチャネルと揃える。
- **ストリーミングターン sink:** `run_tool_call_loop` / `run_query_loop` は任意で `turn_event_sink`（`Sender<TurnEventSink>`）を受け取る: [`TurnEventSink::DeltaText`](../../../../src/agent/agent.rs) はツールループからのドラフト／進捗文字列。[`TurnEventSink::Emit`](../../../../src/agent/agent.rs) はモデルチャンクとツールテレメトリ用に [`TurnEvent`](../../../../src/agent/agent.rs) を包む。[`Agent::turn_streamed`](../../../../src/agent/agent.rs) も同型を使う。[`src/gateway/ws.rs`](../../../../src/gateway/ws.rs) は WebSocket JSON（`chunk`、`tool_call`、`tool_result`、続いて `chunk_reset` と `done`）にマップする。ユーザー向けプロトコル: [`.claude/skills/zeroclaw/references/rest-api.md`](../../../../.claude/skills/zeroclaw/references/rest-api.md)。
- **ターン後の振る舞いの拡張:** `HookHandler::on_after_turn_completed` / `after_turn_completed_blocking` を実装する（引数は `user_message` と `assistant_summary`）。ゲートウェイまたはチャネルと同じ `HookRunner` に登録する。

## アーキテクチャ境界のルール

- 機能拡張はまずトレイト実装 + ファクトリ配線で行い、局所機能のためにモジュール横断の書き換えを避ける。
- 依存の向きは内側の契約へ: 具体実装はトレイト／設定／ユーティリティ層に依存し、他の具体実装に依存しない。
- サブシステム横断の結合を避ける（例: プロバイダがチャネル内部を import する、ツールがゲートウェイ方針を直接変更する）。
- モジュール責務は単一に: オーケストレーションは `agent/`、トランスポートは `channels/`、モデル I/O は `providers/`、ポリシーは `security/`、実行は `tools/`。
- 新しい共有抽象は実利用が三回以上（ルール・オブ・スリー）になってから、かつ実呼び出しが少なくとも一つある場合に限り導入する。
- 設定／スキーマ変更ではキーを公開契約として扱い、デフォルト、互換性影響、移行／ロールバック経路を文書化する。
