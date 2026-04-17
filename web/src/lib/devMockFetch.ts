import { generateUUID } from "./uuid";
import { basePath } from "./basePath";
import { getWebDevMockSection, isWebDevMockActive } from "./devMockConfig";
import gatewayConfigSnapshot from "../../dev-mock-gateway-snapshot.toml?raw";

/** Strip SPA `basePath` so mock routes match gateway-style paths (`/health`, `/api/...`). */
function logicalPathname(pathname: string): string {
  const p = basePath.replace(/\/+$/, "");
  if (!p) return pathname;
  if (pathname === p || pathname === `${p}/`) return "/";
  if (pathname.startsWith(`${p}/`)) return pathname.slice(p.length) || "/";
  return pathname;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyJson(status = 200): Response {
  return new Response("{}", {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function requestPathAndMethod(url: string, init?: RequestInit): { pathname: string; method: string } {
  let pathname: string;
  try {
    pathname = new URL(url, window.location.href).pathname;
  } catch {
    pathname = url.split("?")[0] ?? url;
  }
  const method = (init?.method ?? "GET").toUpperCase();
  return { pathname, method };
}

function mockHealthSnapshot() {
  const now = new Date().toISOString();
  return {
    pid: 0,
    updated_at: now,
    uptime_seconds: 42,
    components: {
      gateway: {
        status: "ok",
        updated_at: now,
        last_ok: now,
        last_error: null,
        restart_count: 0,
      },
    },
  };
}

function mockStatus() {
  const health = mockHealthSnapshot();
  return {
    provider: null,
    model: "dev-mock",
    temperature: 0.7,
    uptime_seconds: 42,
    gateway_port: 42617,
    locale: "en",
    memory_backend: "mock",
    paired: true,
    channels: {},
    health,
  };
}

function sseMockStream(signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(": dev-mock\n\n"));
      const tick = () => {
        if (signal?.aborted) return;
        const payload = JSON.stringify({
          type: "info",
          message: "Web dev mock (no gateway). Edit web/dev-mock.toml to configure.",
        });
        controller.enqueue(enc.encode(`data: ${payload}\n\n`));
      };
      const id = window.setInterval(tick, 45_000);
      signal?.addEventListener(
        "abort",
        () => {
          window.clearInterval(id);
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        },
        { once: true },
      );
    },
  });
}

/**
 * When web dev mock is active, satisfies HTTP requests without contacting the gateway.
 */
export function tryDevMockResponse(url: string, init?: RequestInit): Response | null {
  if (!isWebDevMockActive()) return null;

  const { pathname: rawPath, method } = requestPathAndMethod(url, init);
  const pathname = logicalPathname(rawPath);
  const section = getWebDevMockSection();
  const fakeToken = section?.fake_bearer_token ?? "dev-mock-bearer";

  if (pathname === "/health" && method === "GET") {
    return json({ require_pairing: false, paired: true });
  }

  if (pathname === "/pair" && method === "POST") {
    return json({ token: fakeToken });
  }

  if (pathname === "/admin/paircode" && method === "GET") {
    return json({
      success: true,
      pairing_required: false,
      pairing_code: null,
      message: "dev-mock",
    });
  }

  if (pathname === "/api/status" && method === "GET") {
    return json(mockStatus());
  }

  if (pathname === "/api/health" && method === "GET") {
    return json({ health: mockHealthSnapshot() });
  }

  if (pathname === "/api/config" && method === "GET") {
    const content =
      section?.config_preview?.trim()
      || gatewayConfigSnapshot.trim();
    return json({ format: "toml", content });
  }

  if (pathname === "/api/config" && method === "PUT") {
    return noContent();
  }

  if (pathname === "/api/tools" && method === "GET") {
    return json({ tools: [] as unknown[] });
  }

  if (pathname === "/api/chat-slash-commands" && method === "GET") {
    return json({
      commands: [
        { name: "/new", description: "Clear this chat session and start fresh" },
        { name: "/mock", description: "Dev mock mode (no gateway)" },
      ],
    });
  }

  if (pathname === "/api/cron" && method === "GET") {
    return json({ jobs: [] as unknown[] });
  }

  if (pathname === "/api/cron" && method === "POST") {
    const now = new Date().toISOString();
    let body: Record<string, unknown> = {};
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }
    const job = {
      id: generateUUID(),
      name: body.name ?? "mock job",
      expression: body.schedule ?? "0 * * * *",
      command: body.command ?? "echo mock",
      prompt: null,
      job_type: "command",
      schedule: body.schedule ?? "0 * * * *",
      enabled: body.enabled !== false,
      delivery: null,
      delete_after_run: false,
      created_at: now,
      next_run: now,
      last_run: null,
      last_status: null,
      last_output: null,
    };
    return json({ status: "ok", job });
  }

  if (pathname.startsWith("/api/cron/") && pathname.endsWith("/runs") && method === "GET") {
    return json({ runs: [] as unknown[] });
  }

  if (pathname === "/api/cron/settings" && method === "GET") {
    return json({
      enabled: true,
      catch_up_on_startup: false,
      max_run_history: 20,
    });
  }

  if (pathname === "/api/cron/settings" && method === "PATCH") {
    return json({
      enabled: true,
      catch_up_on_startup: false,
      max_run_history: 20,
      status: "ok",
    });
  }

  if (pathname.startsWith("/api/cron/") && method === "DELETE") {
    return noContent();
  }

  if (pathname.startsWith("/api/cron/") && method === "PATCH") {
    const now = new Date().toISOString();
    return json({
      status: "ok",
      job: {
        id: pathname.replace("/api/cron/", ""),
        name: "mock",
        expression: "0 * * * *",
        command: "echo mock",
        prompt: null,
        job_type: "command",
        schedule: "0 * * * *",
        enabled: true,
        delivery: null,
        delete_after_run: false,
        created_at: now,
        next_run: now,
        last_run: null,
        last_status: null,
        last_output: null,
      },
    });
  }

  if (pathname === "/api/integrations" && method === "GET") {
    return json({
      integrations: [
        {
          name: "mock",
          description: "Dev mock integration",
          category: "mock",
          status: "Available" as const,
        },
      ],
    });
  }

  if (pathname === "/api/doctor" && method === "POST") {
    return json({
      results: [
        {
          severity: "ok" as const,
          category: "web_dev_mock",
          message: "Running with web/dev-mock.toml — gateway is not contacted.",
        },
      ],
    });
  }

  if (pathname === "/api/memory" && method === "GET") {
    return json({ entries: [] as unknown[] });
  }

  if (pathname === "/api/memory" && method === "POST") {
    return emptyJson(200);
  }

  if (pathname.startsWith("/api/memory/") && method === "DELETE") {
    return noContent();
  }

  if (pathname === "/api/cost" && method === "GET") {
    return json({
      cost: {
        session_cost_usd: 0,
        daily_cost_usd: 0,
        monthly_cost_usd: 0,
        total_tokens: 0,
        request_count: 0,
        by_model: {},
      },
    });
  }

  if (pathname === "/api/cli-tools" && method === "GET") {
    return json({ cli_tools: [] as unknown[] });
  }

  if (pathname === "/api/devices" && method === "GET") {
    return json({ devices: [] as unknown[] });
  }

  if (pathname === "/api/pairing/initiate" && method === "POST") {
    return json({ pairing_code: "MOCK" });
  }

  if (pathname.startsWith("/api/devices/") && method === "DELETE") {
    return noContent();
  }

  if (pathname === "/api/canvas" && method === "GET") {
    return json({ canvases: ["default"] });
  }

  if (pathname.startsWith("/api/canvas/") && method === "DELETE") {
    return noContent();
  }

  if (pathname === "/api/events" && method === "GET") {
    return new Response(sseMockStream(init?.signal ?? undefined), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  return json(
    {
      error: "dev_mock_unhandled",
      path: pathname,
      method,
      hint: "Add a handler in web/src/lib/devMockFetch.ts or run the real gateway.",
    },
    501,
  );
}
