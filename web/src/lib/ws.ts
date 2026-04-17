import type { WsMessage } from '../types/api';
import { getToken } from './auth';
import { apiOrigin, gatewayPublicPrefix } from './basePath';
import { isWebDevMockActive, getWebDevMockSection } from './devMockConfig';
import {
  ensureGatewayChatDocumentSession,
  getOrCreateGatewayChatSessionId,
  allocateNewGatewayChatSessionId,
} from './gatewayChatSession';
import { isTauri } from './tauri';

export type WsMessageHandler = (msg: WsMessage) => void;
export type WsOpenHandler = () => void;
export type WsCloseHandler = (ev: CloseEvent) => void;
export type WsErrorHandler = (ev: Event) => void;

export interface WebSocketClientOptions {
  /** Base URL override. Defaults to current host with ws(s) protocol. */
  baseUrl?: string;
  /** Delay in ms before attempting reconnect. Doubles on each failure up to maxReconnectDelay. */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms. */
  maxReconnectDelay?: number;
  /** Set to false to disable auto-reconnect. Default true. */
  autoReconnect?: boolean;
}

const DEFAULT_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  /** When set, `connect()` skipped the real socket (web dev mock). */
  private devMockOpen = false;
  private currentDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  /** Next real connection should send `fresh=true` (manual new session or doc prep). */
  private pendingFreshQuery = false;
  /** Last successful WebSocket open used `fresh=true` (consumed by `takeFreshConnectFlag`). */
  private lastConnectHadFreshQuery = false;

  public onMessage: WsMessageHandler | null = null;
  public onOpen: WsOpenHandler | null = null;
  public onClose: WsCloseHandler | null = null;
  public onError: WsErrorHandler | null = null;

  private readonly baseUrl: string;
  private readonly reconnectDelay: number;
  private readonly maxReconnectDelay: number;
  private readonly autoReconnect: boolean;

  constructor(options: WebSocketClientOptions = {}) {
    let defaultBase: string;
    if (isTauri() && apiOrigin) {
      defaultBase = apiOrigin.replace(/^http/, 'ws');
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      defaultBase = `${protocol}//${window.location.host}`;
    }
    this.baseUrl = options.baseUrl ?? defaultBase;
    this.reconnectDelay = options.reconnectDelay ?? DEFAULT_RECONNECT_DELAY;
    this.maxReconnectDelay = options.maxReconnectDelay ?? MAX_RECONNECT_DELAY;
    this.autoReconnect = options.autoReconnect ?? true;
    this.currentDelay = this.reconnectDelay;
  }

  /** Open the WebSocket connection (async prep runs internally). */
  connect(): void {
    void this.openSocketConnection();
  }

  /**
   * New gateway chat session: new `session_id`, optional `fresh` query on next open,
   * reconnect without marking the socket intentionally closed.
   */
  rotateSessionId(): void {
    this.intentionallyClosed = false;
    this.pendingFreshQuery = true;
    allocateNewGatewayChatSessionId();
    this.clearReconnectTimer();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    } else {
      this.devMockOpen = false;
      void this.openSocketConnection();
    }
  }

  private async openSocketConnection(): Promise<void> {
    this.intentionallyClosed = false;
    this.clearReconnectTimer();

    const prep = await ensureGatewayChatDocumentSession();
    const addFresh = prep.useFreshQuery || this.pendingFreshQuery;
    if (this.pendingFreshQuery) {
      this.pendingFreshQuery = false;
    }

    if (isWebDevMockActive()) {
      this.devMockOpen = true;
      this.lastConnectHadFreshQuery = addFresh;
      queueMicrotask(() => {
        this.onOpen?.();
      });
      return;
    }

    this.devMockOpen = false;

    const token = getToken();
    const sessionId = getOrCreateGatewayChatSessionId();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('session_id', sessionId);
    if (addFresh) {
      params.set('fresh', 'true');
    }
    const url = `${this.baseUrl}${gatewayPublicPrefix}/ws/chat?${params.toString()}`;

    const protocols: string[] = ['zeroclaw.v1'];
    if (token) protocols.push(`bearer.${token}`);
    this.ws = new WebSocket(url, protocols);

    this.ws.onopen = () => {
      this.currentDelay = this.reconnectDelay;
      this.lastConnectHadFreshQuery = addFresh;
      this.onOpen?.();
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        this.onMessage?.(msg);
      } catch {
        // Ignore non-JSON frames
      }
    };

    this.ws.onclose = (ev: CloseEvent) => {
      this.onClose?.(ev);
      this.scheduleReconnect();
    };

    this.ws.onerror = (ev: Event) => {
      this.onError?.(ev);
    };
  }

  /** Send a chat message to the agent. */
  sendMessage(content: string): void {
    if (this.devMockOpen) {
      const echo = getWebDevMockSection()?.websocket_echo !== false;
      if (!echo) {
        throw new Error('WebSocket is not connected');
      }
      queueMicrotask(() => {
        const reply = `[dev-mock] ${content}`;
        this.onMessage?.({ type: 'chunk', content: reply });
        this.onMessage?.({ type: 'done', full_response: reply });
      });
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify({ type: 'message', content }));
  }

  /** Close the connection without auto-reconnecting. */
  disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.devMockOpen = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Returns true if the socket is open. */
  get connected(): boolean {
    if (this.devMockOpen) return true;
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Whether the current (or most recent) connection opened with `fresh=true`.
   * Call once when handling `session_start` to drive navigation toasts.
   */
  takeFreshConnectFlag(): boolean {
    const v = this.lastConnectHadFreshQuery;
    this.lastConnectHadFreshQuery = false;
    return v;
  }

  // ---------------------------------------------------------------------------
  // Reconnection logic
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || !this.autoReconnect) return;

    this.reconnectTimer = setTimeout(() => {
      this.currentDelay = Math.min(this.currentDelay * 2, this.maxReconnectDelay);
      void this.openSocketConnection();
    }, this.currentDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
