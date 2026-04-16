import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Bot, User, AlertCircle, Copy, Check } from 'lucide-react';
import type { WsMessage } from '@/types/api';
import { WebSocketClient } from '@/lib/ws';
import { generateUUID } from '@/lib/uuid';
import { useDraft } from '@/hooks/useDraft';
import { getChatSlashCommands, type ChatSlashCommand } from '@/lib/api';
import { t } from '@/lib/i18n';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

const DRAFT_KEY = 'agent-chat';

/** Mirrors `slash_command_catalog` in `src/gateway/chat_slash.rs` for offline / API-failure UX. */
const FALLBACK_SLASH_COMMANDS: ChatSlashCommand[] = [
  { name: '/new', description: 'Clear this chat session and start fresh' },
  { name: '/reset', description: 'Same as /new' },
  { name: '/models', description: 'List providers or /models <provider> to switch' },
  { name: '/model', description: 'Show models or /model <id> to switch' },
  { name: '/config', description: 'Show current provider, model, and routes' },
];

/** Token from last whitespace (or line start) to cursor, for gateway-style slash commands. */
function getSlashToken(value: string, cursor: number): { token: string; tokenStart: number } | null {
  const before = value.slice(0, cursor);
  const m = before.match(/(?:^|\s)(\S*)$/);
  const token = m?.[1];
  if (token === undefined || !token.startsWith('/')) return null;
  return { token, tokenStart: before.length - token.length };
}

export default function AgentChat() {
  const { draft, saveDraft, clearDraft } = useDraft(DRAFT_KEY);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(draft);
  const [typing, setTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocketClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pendingContentRef = useRef('');
  const [streamingContent, setStreamingContent] = useState('');
  const [slashCommands, setSlashCommands] = useState<ChatSlashCommand[]>([]);
  const [caretPos, setCaretPos] = useState(() => draft.length);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashPickerSuppressed, setSlashPickerSuppressed] = useState(false);
  const prevSlashTokenLenRef = useRef(0);

  const slashHintLine = useMemo(() => {
    if (slashCommands.length === 0) return t('agent.slash_hint');
    return slashCommands.map((c) => `${c.name}: ${c.description}`).join(' · ');
  }, [slashCommands]);

  const slashSuggestionState = useMemo(() => {
    const info = getSlashToken(input, caretPos);
    if (!info || slashCommands.length === 0) {
      return { suggestions: [] as ChatSlashCommand[], token: '', tokenStart: 0 };
    }
    const q = info.token.toLowerCase();
    const suggestions = slashCommands.filter((c) => c.name.toLowerCase().startsWith(q));
    return { suggestions, token: info.token, tokenStart: info.tokenStart };
  }, [input, caretPos, slashCommands]);

  useEffect(() => {
    const info = getSlashToken(input, caretPos);
    if (info === null) {
      setSlashPickerSuppressed(false);
      prevSlashTokenLenRef.current = 0;
      return;
    }
    const len = info.token.length;
    if (len < prevSlashTokenLenRef.current) {
      setSlashPickerSuppressed(false);
    }
    prevSlashTokenLenRef.current = len;
  }, [input, caretPos]);

  useEffect(() => {
    const n = slashSuggestionState.suggestions.length;
    setSlashActiveIndex((idx) => (n === 0 ? 0 : Math.min(idx, n - 1)));
  }, [slashSuggestionState.suggestions.length]);

  const showSlashPicker =
    connected &&
    !slashPickerSuppressed &&
    slashSuggestionState.suggestions.length > 0;

  // Persist draft to in-memory store so it survives route changes
  useEffect(() => {
    saveDraft(input);
  }, [input, saveDraft]);

  useEffect(() => {
    const ws = new WebSocketClient();

    ws.onOpen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onClose = (ev: CloseEvent) => {
      setConnected(false);
      if (ev.code !== 1000 && ev.code !== 1001) {
        setError(`Connection closed unexpectedly (code: ${ev.code}). Please check your configuration.`);
      }
    };

    ws.onError = () => {
      setError(t('agent.connection_error'));
    };

    ws.onMessage = (msg: WsMessage) => {
      switch (msg.type) {
        case 'chunk':
          setTyping(true);
          pendingContentRef.current += msg.content ?? '';
          setStreamingContent(pendingContentRef.current);
          break;

        case 'chunk_reset':
          // Server signals that the authoritative done message follows;
          // clear the draft so it does not duplicate the final content.
          pendingContentRef.current = '';
          setStreamingContent('');
          break;

        case 'message':
        case 'done': {
          const content = msg.full_response ?? msg.content ?? pendingContentRef.current;
          if (content) {
            setMessages((prev) => [
              ...prev,
              {
                id: generateUUID(),
                role: 'agent',
                content,
                timestamp: new Date(),
              },
            ]);
          }
          pendingContentRef.current = '';
          setStreamingContent('');
          setTyping(false);
          break;
        }

        case 'tool_call':
          setMessages((prev) => [
            ...prev,
            {
              id: generateUUID(),
              role: 'agent',
              content: `${t('agent.tool_call_prefix')} ${msg.name ?? 'unknown'}(${JSON.stringify(msg.args ?? {})})`,
              timestamp: new Date(),
            },
          ]);
          break;

        case 'tool_result':
          setMessages((prev) => [
            ...prev,
            {
              id: generateUUID(),
              role: 'agent',
              content: `${t('agent.tool_result_prefix')} ${msg.output ?? ''}`,
              timestamp: new Date(),
            },
          ]);
          break;

        case 'error':
          setMessages((prev) => [
            ...prev,
            {
              id: generateUUID(),
              role: 'agent',
              content: `${t('agent.error_prefix')} ${msg.message ?? t('agent.unknown_error')}`,
              timestamp: new Date(),
            },
          ]);
          if (msg.code === 'AGENT_INIT_FAILED' || msg.code === 'AUTH_ERROR' || msg.code === 'PROVIDER_ERROR') {
            setError(`Configuration error: ${msg.message}. Please check your provider settings (API key, model, etc.).`);
          } else if (msg.code === 'INVALID_JSON' || msg.code === 'UNKNOWN_MESSAGE_TYPE' || msg.code === 'EMPTY_CONTENT') {
            setError(`Message error: ${msg.message}`);
          }
          setTyping(false);
          pendingContentRef.current = '';
          setStreamingContent('');
          break;
      }
    };

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, streamingContent]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getChatSlashCommands();
        if (cancelled) return;
        setSlashCommands(data.commands.length > 0 ? data.commands : FALLBACK_SLASH_COMMANDS);
      } catch {
        if (!cancelled) setSlashCommands(FALLBACK_SLASH_COMMANDS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const applySlashCompletion = useCallback(
    (cmd: ChatSlashCommand) => {
      const el = inputRef.current;
      if (!el) return;
      const cursor = el.selectionStart ?? input.length;
      const info = getSlashToken(input, cursor);
      if (!info) return;
      const beforeSlice = input.slice(0, info.tokenStart);
      const afterSlice = input.slice(cursor);
      const newValue = beforeSlice + cmd.name + afterSlice;
      const newPos = beforeSlice.length + cmd.name.length;
      setInput(newValue);
      setSlashPickerSuppressed(true);
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(newPos, newPos);
        setCaretPos(newPos);
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      });
    },
    [input],
  );

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !wsRef.current?.connected) return;

    setMessages((prev) => [
      ...prev,
      {
        id: generateUUID(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      },
    ]);

    try {
      wsRef.current.sendMessage(trimmed);
      setTyping(true);
      pendingContentRef.current = '';
    } catch {
      setError(t('agent.send_error'));
    }

    setInput('');
    clearDraft();
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const suggestions = slashSuggestionState.suggestions;
    if (showSlashPicker && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashPickerSuppressed(true);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        const cmd = suggestions[slashActiveIndex] ?? suggestions[0];
        if (cmd) applySlashCompletion(cmd);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const syncCaret = () => {
    const el = inputRef.current;
    if (el) setCaretPos(el.selectionStart);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setCaretPos(e.target.selectionStart ?? e.target.value.length);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const handleCopy = useCallback((msgId: string, content: string) => {
    const onSuccess = () => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((prev) => (prev === msgId ? null : prev)), 2000);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(content).then(onSuccess).catch(() => {
        // Fallback for insecure contexts (HTTP)
        fallbackCopy(content) && onSuccess();
      });
    } else {
      fallbackCopy(content) && onSuccess();
    }
  }, []);

  /**
   * Fallback copy using a temporary textarea for HTTP contexts
   * where navigator.clipboard is unavailable.
   */
  function fallbackCopy(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Connection status bar */}
      {error && (
        <div className="px-4 py-2 border-b flex items-center gap-2 text-sm animate-fade-in" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', }}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in" style={{ color: 'var(--pc-text-muted)' }}>
            <div className="h-16 w-16 rounded-3xl flex items-center justify-center mb-4 animate-float" style={{ background: 'var(--pc-accent-glow)' }}>
              <Bot className="h-8 w-8" style={{ color: 'var(--pc-accent)' }} />
            </div>
            <p className="text-lg font-semibold mb-1" style={{ color: 'var(--pc-text-primary)' }}>ZeroClaw Agent</p>
            <p className="text-sm" style={{ color: 'var(--pc-text-muted)' }}>{t('agent.start_conversation')}</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg.id}
            className={`group flex items-start gap-3 ${
              msg.role === 'user' ? 'flex-row-reverse animate-slide-in-right' : 'animate-slide-in-left'
            }`}
            style={{ animationDelay: `${Math.min(idx * 30, 200)}ms` }}
          >
            <div
              className="flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center border"
              style={{
                background: msg.role === 'user' ? 'var(--pc-accent)' : 'var(--pc-bg-elevated)',
                borderColor: msg.role === 'user' ? 'var(--pc-accent)' : 'var(--pc-border)',
              }}
            >
              {msg.role === 'user' ? (
                <User className="h-4 w-4 text-white" />
              ) : (
                <Bot className="h-4 w-4" style={{ color: 'var(--pc-accent)' }} />
              )}
            </div>
            <div className="relative max-w-[75%]">
              <div
                className="rounded-2xl px-4 py-3 border"
                style={
                  msg.role === 'user'
                    ? { background: 'var(--pc-accent-glow)', borderColor: 'var(--pc-accent-dim)', color: 'var(--pc-text-primary)', }
                    : { background: 'var(--pc-bg-elevated)', borderColor: 'var(--pc-border)', color: 'var(--pc-text-primary)', }
                }
              >
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                <p
                  className="text-[10px] mt-1.5" style={{ color: msg.role === 'user' ? 'var(--pc-accent-light)' : 'var(--pc-text-faint)' }}>
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => handleCopy(msg.id, msg.content)}
                aria-label={t('agent.copy_message')}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-xl"
                style={{ background: 'var(--pc-bg-elevated)', border: '1px solid var(--pc-border)', color: 'var(--pc-text-muted)', }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--pc-text-primary)'; e.currentTarget.style.borderColor = 'var(--pc-accent-dim)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--pc-text-muted)'; e.currentTarget.style.borderColor = 'var(--pc-border)'; }}
              >
                {copiedId === msg.id ? (
                  <Check className="h-3 w-3" style={{ color: '#34d399' }} />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex items-start gap-3 animate-fade-in">
            <div className="flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center border" style={{ background: 'var(--pc-bg-elevated)', borderColor: 'var(--pc-border)' }}>
              <Bot className="h-4 w-4" style={{ color: 'var(--pc-accent)' }} />
            </div>
            {streamingContent ? (
              <div className="rounded-2xl px-4 py-3 border max-w-[75%]" style={{ background: 'var(--pc-bg-elevated)', borderColor: 'var(--pc-border)', color: 'var(--pc-text-primary)' }}>
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{streamingContent}</p>
              </div>
            ) : (
              <div className="rounded-2xl px-4 py-3 border flex items-center gap-1.5" style={{ background: 'var(--pc-bg-elevated)', borderColor: 'var(--pc-border)' }}>
                <span className="bounce-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--pc-accent)' }} />
                <span className="bounce-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--pc-accent)' }} />
                <span className="bounce-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--pc-accent)' }} />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-4" style={{ borderColor: 'var(--pc-border)', background: 'var(--pc-bg-surface)' }}>
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <div className="relative flex-1 min-w-0">
            {showSlashPicker && (
              <ul
                role="listbox"
                aria-label={t('agent.slash_suggestions_aria')}
                className="absolute left-0 right-0 bottom-full mb-1 z-20 max-h-48 overflow-y-auto rounded-xl border py-1 shadow-lg"
                style={{
                  background: 'var(--pc-bg-elevated)',
                  borderColor: 'var(--pc-border)',
                  boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
                }}
              >
                {slashSuggestionState.suggestions.map((cmd, idx) => (
                  <li key={cmd.name} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === slashActiveIndex}
                      className="w-full text-left px-3 py-2 text-sm flex flex-col gap-0.5 transition-colors"
                      style={{
                        background: idx === slashActiveIndex ? 'var(--pc-accent-glow)' : 'transparent',
                        color: 'var(--pc-text-primary)',
                      }}
                      onMouseEnter={() => setSlashActiveIndex(idx)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        applySlashCompletion(cmd);
                      }}
                    >
                      <span className="font-mono font-medium">{cmd.name}</span>
                      <span className="text-[11px] leading-snug" style={{ color: 'var(--pc-text-muted)' }}>
                        {cmd.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onSelect={syncCaret}
              onClick={syncCaret}
              placeholder={connected ? t('agent.type_message') : t('agent.connecting')}
              disabled={!connected}
              className="input-electric w-full px-4 text-sm resize-none disabled:opacity-40"
              style={{ minHeight: '44px', maxHeight: '200px', paddingTop: '10px', paddingBottom: '10px' }}
            />
          </div>
          <button
            type='button'
            onClick={handleSend}
            disabled={!connected || !input.trim()}
            className="btn-electric flex-shrink-0 rounded-2xl flex items-center justify-center"
            style={{ color: 'white', width: '40px', height: '40px' }}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center justify-center mt-2 gap-2">
          <span
            className="status-dot"
            style={connected
              ? { background: 'var(--color-status-success)', boxShadow: '0 0 6px var(--color-status-success)' }
              : { background: 'var(--color-status-error)', boxShadow: '0 0 6px var(--color-status-error)' }
            }
          />
          <span className="text-[10px]" style={{ color: 'var(--pc-text-faint)' }}>
            {connected ? t('agent.connected_status') : t('agent.disconnected_status')}
          </span>
        </div>
        <p
          className="text-center text-[10px] mt-2 max-w-4xl mx-auto leading-relaxed px-2"
          style={{ color: 'var(--pc-text-faint)' }}
        >
          {slashHintLine}
        </p>
      </div>
    </div>
  );
}
