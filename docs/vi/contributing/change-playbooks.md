# Sổ tay thay đổi

Hướng dẫn từng bước cho các kiểu mở rộng và chỉnh sửa thường gặp trong ZeroClaw.

Để xem ví dụ mã đầy đủ cho từng trait mở rộng, xem [extension-examples.md](../../contributing/extension-examples.md).

## Thêm nhà cung cấp (provider)

- Triển khai `Provider` trong `src/providers/`.
- Đăng ký trong factory `src/providers/mod.rs`.
- Thêm kiểm thử tập trung cho dây nối factory và nhánh lỗi.
- Tránh để hành vi riêng của provider rò rỉ vào tầng điều phối dùng chung.

## Thêm kênh (channel)

- Triển khai `Channel` trong `src/channels/`.
- Giữ ngữ nghĩa `send`, `listen`, `health_check`, gõ (typing) nhất quán.
- Bao phủ xác thực/allowlist/health bằng kiểm thử.

## Thêm công cụ (tool)

- Triển khai `Tool` trong `src/tools/` với schema tham số chặt chẽ.
- Xác thực và làm sạch mọi đầu vào.
- Trả về `ToolResult` có cấu trúc; tránh panic trên đường chạy runtime.

## Thêm thiết bị ngoại vi (peripheral)

- Triển khai `Peripheral` trong `src/peripherals/`.
- Thiết bị ngoại vi công khai `tools()` — mỗi tool ủy quyền cho phần cứng (GPIO, cảm biến, v.v.).
- Đăng ký loại bo mạch trong schema cấu hình nếu cần.
- Xem `docs/hardware/hardware-peripherals-design.md` về giao thức và firmware.

## Thay đổi bảo mật / runtime / gateway

- Ghi chú mối đe dọa/rủi ro và chiến lược rollback.
- Bổ sung/cập nhật kiểm thử hoặc bằng chứng xác thực cho chế độ lỗi và ranh giới.
- Giữ khả năng quan sát hữu ích nhưng không chứa dữ liệu nhạy cảm.
- Với thay đổi `.github/workflows/**`, ghi rõ tác động tới allowlist Actions trong mô tả PR và cập nhật `docs/contributing/actions-source-policy.md` khi nguồn thay đổi.

## Hệ thống tài liệu / README / IA

- Coi điều hướng tài liệu như UX sản phẩm: README → hub tài liệu → SUMMARY → mục lục theo danh mục.
- Giữ điều hướng cấp cao gọn; tránh liên kết trùng lặp giữa các khối liền kề.
- Khi bề mặt runtime thay đổi, cập nhật tham chiếu liên quan trong `docs/reference/`.
- Khi đổi điều hướng hoặc cách diễn đạt quan trọng, giữ đồng bộ điểm vào đa ngôn ngữ cho mọi locale được hỗ trợ (`en`, `zh-CN`, `ja`, `ru`, `fr`, `vi`).
- Khi đổi văn bản dùng chung, đồng bộ bản dịch trong cùng PR (hoặc ghi rõ hoãn và PR tiếp theo).

## Trạng thái dùng chung của tool

- Tuân theo mẫu handle `Arc<RwLock<T>>` cho tool sở hữu trạng thái dùng chung sống lâu.
- Nhận handle lúc khởi tạo; không tạo trạng thái toàn cục/tĩnh có thể thay đổi.
- Dùng `ClientId` (daemon cung cấp) để phân không gian tên theo client — không tự dựng khóa định danh trong tool.
- Tách trạng thái nhạy cảm (thông tin đăng nhập, hạn mức) theo client; trạng thái phát sóng/hiển thị có thể dùng chung với tiền tố không gian tên tùy chọn.
- Xác thực đã cache bị vô hiệu khi đổi cấu hình — tool phải xác thực lại trước lần thực thi tiếp theo sau tín hiệu.
- Hợp đồng đầy đủ: [ADR-004: Tool Shared State Ownership](../../architecture/adr-004-tool-shared-state-ownership.md).

## Vòng lặp tool của agent, QueryEngine và hook

- **Một đường tool:** `run_tool_call_loop` trong `src/agent/loop_.rs` luôn đi vào `run_query_loop` trong `src/agent/query_engine.rs`, ghi chẩn đoán [`TransitionReason`](../../../src/agent/state.rs) và chạy hook sau lượt **`void` + `blocking`** khi thành công (`src/agent/stop_hooks.rs`). **Không** có feature Cargo `query_engine_v2`; đường này luôn bật.
- **Compaction:** cắt tỉa trước gọi LLM dùng `src/agent/compaction_pipeline.rs` (giai đoạn có tên + `history_pruner`); thử lại ngữ cảnh phản ứng dùng helper cùng module khi được nối từ vòng lặp.
- **System prompt:** lắp ráp chuẩn nằm trong `src/agent/system_prompt.rs` (tiền tố tĩnh được ghi nhớ + đuôi biến động; `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` để tách). `build_system_prompt_*` trong `src/channels/mod.rs` ủy quyền tới đây; một số luồng truyền `system_prompt_refresh` vào `run_tool_call_loop` để `src/agent/loop_.rs` làm mới `history[0]` sau `run_pre_llm_phases`. `src/providers/anthropic.rs` ánh xạ marker đó thành hai khối system để cache prompt. Thống kê trong tiến trình: `crate::agent::query_engine::last_system_prompt_assembly` và `zeroclaw doctor query-engine`.
- **Ưu tiên transcript:** dòng user cho JSONL phiên nên được commit qua `session_transcript::commit_user_turn` ở ranh giới điều phối trước khi model chạy (kênh và `Agent::turn` / `turn_streamed` theo mẫu này).
- **Dựng HookRunner:** `crate::hooks::hook_runner_from_config` (`src/hooks/mod.rs`) đăng ký builtin theo cấu hình khi `[hooks].enabled`, và luôn đăng ký **`MemoryConsolidationHook`** khi `memory.auto_save` là true (kể cả khi hook tắt), để không lặp `tokio::spawn` ở phía kênh.
- **Gateway:** dựng `HookRunner` trong `run_gateway`, lưu vào `AppState.hooks`, truyền `state.hooks.clone()` vào `Agent::from_config_with_hooks` cho `/ws/chat` để hook sau lượt khớp hành vi kênh.
- **Sink lượt streaming:** `run_tool_call_loop` / `run_query_loop` nhận tùy chọn `turn_event_sink` (`Sender<TurnEventSink>`): [`TurnEventSink::DeltaText`](../../../src/agent/agent.rs) mang chuỗi nháp/tiến độ từ vòng tool; [`TurnEventSink::Emit`](../../../src/agent/agent.rs) bọc [`TurnEvent`](../../../src/agent/agent.rs) cho chunk model và telemetry tool. [`Agent::turn_streamed`](../../../src/agent/agent.rs) dùng cùng kiểu; [`src/gateway/ws.rs`](../../../src/gateway/ws.rs) ánh xạ sang JSON WebSocket (`chunk`, `tool_call`, `tool_result`, rồi `chunk_reset` + `done`). Giao thức người dùng: [`.claude/skills/zeroclaw/references/rest-api.md`](../../../.claude/skills/zeroclaw/references/rest-api.md).
- **Mở rộng sau lượt:** triển khai `HookHandler::on_after_turn_completed` / `after_turn_completed_blocking` (nhận `user_message` + `assistant_summary`); đăng ký trên cùng `HookRunner` mà gateway hoặc kênh dùng.

## Quy tắc ranh giới kiến trúc

- Mở rộng bằng thêm implementation trait + nối factory trước; tránh viết lại xuyên module cho một tính năng cô lập.
- Giữ hướng phụ thuộc vào trong tới hợp đồng: tích hợp cụ thể phụ thuộc lớp trait/cấu hình/tiện ích, không phụ thuộc tích hợp cụ thể khác.
- Tránh ghép nối chéo hệ thống con (ví dụ provider import nội bộ kênh, tool sửa trực tiếp chính sách gateway).
- Mỗi module một trách nhiệm: điều phối trong `agent/`, vận chuyển trong `channels/`, I/O model trong `providers/`, chính sách trong `security/`, thực thi trong `tools/`.
- Chỉ giới thiệu trừu tượng dùng chung mới sau khi lặp lại thực tế (quy tắc ba lần), với ít nhất một caller thật.
- Với thay đổi config/schema, coi khóa là hợp đồng công khai: ghi mặc định, tác động tương thích và đường migrate/rollback.
