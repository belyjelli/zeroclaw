import { tryDevMockResponse } from "./devMockFetch";

/**
 * Same as `fetch`, but when web dev mock mode is active (`web/dev-mock.toml`),
 * matching requests are answered locally without the gateway.
 */
export function runtimeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : input.href;
  const mocked = tryDevMockResponse(url, init);
  if (mocked) return Promise.resolve(mocked);
  return fetch(input as RequestInfo, init);
}
