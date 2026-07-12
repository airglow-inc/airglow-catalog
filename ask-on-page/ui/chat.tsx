import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { Search, ChevronDown, ArrowUp, Globe, MessageSquare } from 'lucide-react';

declare const airglow: any;

// ── Types ──

interface SearchResult {
  url: string;
  title: string;
  domain: string;
}

interface WebSearchBlock {
  results: SearchResult[];
}

interface MessageBlock {
  type: 'text' | 'search';
  text?: string;
  search?: WebSearchBlock;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  rawContent?: string; // raw assistant message content for conversation continuity
}

interface PendingData {
  mode: { name: string; system: string; format: string; inputLabel: string };
  context: string;
  query: string;
  screenshot?: { base64: string; mediaType: string } | null;
}

// ── Markdown ──

marked.setOptions({ breaks: true, gfm: true });

function md(src: string): string {
  return marked.parse(src) as string;
}

// Prose styles — Tailwind typography plugin isn't bundled, so we inline them
export const PROSE_CSS = `
.askme-prose { line-height: 1.65; color: #1a1a1a; }
.askme-prose br { display: block; content: ''; margin-top: 0.5em; }
.askme-prose h1, .askme-prose h2, .askme-prose h3, .askme-prose h4 {
  font-weight: 600; margin-top: 1.2em; margin-bottom: 0.5em; line-height: 1.3;
}
.askme-prose h1 { font-size: 1.4em; }
.askme-prose h2 { font-size: 1.25em; }
.askme-prose h3 { font-size: 1.1em; }
.askme-prose h4 { font-size: 1em; }
.askme-prose p { margin: 0.6em 0; }
.askme-prose p:first-child { margin-top: 0; }
.askme-prose p:last-child { margin-bottom: 0; }
.askme-prose ul, .askme-prose ol { margin: 0.4em 0; padding-left: 1.5em; list-style: disc; }
.askme-prose ol { list-style: decimal; }
.askme-prose li { margin: 0.2em 0; }
.askme-prose li::marker { color: var(--fg-primary, #1a1a1a); }
.askme-prose blockquote {
  border-left: 3px solid #e5e3d9; padding-left: 1em; margin: 0.8em 0;
  color: #5b5a56; font-style: italic;
}
.askme-prose code {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.88em;
  background: #f0efe8; padding: 0.15em 0.35em; border-radius: 4px;
}
.askme-prose pre {
  background: #f0efe8; border-radius: 6px; padding: 0.8em 1em;
  overflow-x: auto; margin: 0.8em 0;
}
.askme-prose pre code { background: none; padding: 0; font-size: 0.85em; }
.askme-prose strong { font-weight: 600; }
.askme-prose a { color: #c06a20; text-decoration: underline; text-underline-offset: 2px; }
.askme-prose a:hover { color: #a05010; }
.askme-prose hr { border: none; border-top: 1px solid #e5e3d9; margin: 1.2em 0; }
.askme-prose table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
.askme-prose th, .askme-prose td { border: 1px solid #e5e3d9; padding: 0.4em 0.7em; text-align: left; font-size: 0.9em; }
.askme-prose th { background: #f0efe8; font-weight: 600; }
.askme-prose img { max-width: 100%; border-radius: 6px; }
`;

// ── Chat component ──

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  // Assistant text streamed so far for the in-flight turn; rendered as a live
  // bubble, then replaced by the final message (which adds citations).
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingData | null>(null);
  const [error, setError] = useState('');

  const messagesRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef<PendingData | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  function persistConversation(msgs: ChatMessage[]) {
    if (msgs.length > 0 && pendingRef.current) {
      airglow.storage.set('askme_session', { messages: msgs, pending: pendingRef.current });
    }
  }

  // Load pending query on mount — or restore previous session
  useEffect(() => {
    (async () => {
      const data = await airglow.storage.get('askme_pending');
      if (data) {
        // New query — start fresh
        setPending(data);
        pendingRef.current = data;
        await airglow.storage.delete('askme_pending');

        const parts: string[] = [];
        if (data.context) parts.push(`**Context:** ${data.context}`);
        if (data.query) parts.push(`**${data.mode.inputLabel}:** ${data.query}`);
        const userText = parts.join('\n\n');

        const userMsg: ChatMessage = { role: 'user', blocks: [{ type: 'text', text: userText }] };
        // Store screenshot ref for API calls (not displayed in chat bubbles)
        (userMsg as any).screenshot = data.screenshot || null;
        messagesRef.current = [userMsg];
        setMessages([userMsg]);

        await sendToApi([userMsg], data.mode.system);
        return;
      }

      // No pending — try restoring previous session
      const session = await airglow.storage.get('askme_session');
      if (session?.messages?.length > 0) {
        setPending(session.pending);
        pendingRef.current = session.pending;
        messagesRef.current = session.messages;
        setMessages(session.messages);
        return;
      }

      setError('No query data found. Use Ctrl+J on a page to start.');
    })();
  }, []);

  async function sendToApi(msgs: ChatMessage[], systemPrompt: string) {
    setStreaming(true);
    setError('');

    // Build API messages from chat history
    const apiMessages: any[] = [];
    for (const msg of msgs) {
      if (msg.role === 'user') {
        const screenshot = (msg as any).screenshot;
        if (screenshot?.base64) {
          // Include screenshot as image part + text
          apiMessages.push({
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${screenshot.mediaType};base64,${screenshot.base64}` },
              },
              { type: 'text', text: msg.blocks.map(b => b.text).join('\n') },
            ],
          });
        } else {
          apiMessages.push({ role: 'user', content: msg.blocks.map(b => b.text).join('\n') });
        }
      } else if (msg.rawContent) {
        apiMessages.push({ role: 'assistant', content: msg.rawContent });
      }
    }

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    try {
      // airglow.llm proxies to the platform's LLM gateway — no app API key
      // needed. Streams: text renders live via the draft bubble; the promise
      // still resolves with the complete message (used for citations +
      // history). Server-tool searches run silently before the first chunk.
      let acc = '';
      const response = await airglow.llm.chat({
        model: 'anthropic/claude-sonnet-5',
        tools: [{ type: 'openrouter:web_search' }],
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nCRITICAL: Maximum 3-5 sentences. No essays, no exhaustive lists, no elaboration. The user will ask follow-up questions if they want more. Respond like a sharp colleague giving a quick answer, not a textbook. Only use web search for things you genuinely don\'t know or that require current/recent/specialized information. Most terms can be explained from your training data.',
          },
          ...apiMessages,
        ],
      }, {
        onEvent: (c: any) => {
          if (abortCtrl.signal.aborted) return;
          const delta = c?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            acc += delta;
            setDraft(acc);
          }
        },
      });

      // Stopped by user while waiting — drop the response.
      if (abortCtrl.signal.aborted) {
        setDraft('');
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      const message = response?.choices?.[0]?.message;
      const text: string = message?.content ?? '';
      const blocks: MessageBlock[] = [];

      // Web plugin citations arrive as message.annotations (url_citation entries)
      const results: SearchResult[] = [];
      for (const a of message?.annotations || []) {
        if (a.type === 'url_citation' && a.url_citation) {
          results.push({
            url: a.url_citation.url || '',
            title: a.url_citation.title || '',
            domain: new URL(a.url_citation.url || 'https://example.com').hostname,
          });
        }
      }
      if (results.length > 0) {
        blocks.push({ type: 'search', search: { results } });
      }
      if (text.trim()) {
        blocks.push({ type: 'text', text });
      }

      const finalMsg: ChatMessage = { role: 'assistant', blocks, rawContent: text };
      messagesRef.current = [...messagesRef.current, finalMsg];
      setMessages([...messagesRef.current]);
      persistConversation(messagesRef.current);
      scrollToBottom();

    } catch (e: any) {
      if (!abortCtrl.signal.aborted) {
        setError(e.message || 'API call failed');
        airglow.log.error('ask-on-page chat error', { error: e.message, stack: e.stack });
      }
    }

    setDraft('');
    setStreaming(false);
    abortRef.current = null;
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function sendFollowUp() {
    if (!input.trim() || streaming || !pending) return;
    const text = input.trim();
    setInput('');

    const userMsg: ChatMessage = { role: 'user', blocks: [{ type: 'text', text }] };
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages([...messagesRef.current]);

    await sendToApi(messagesRef.current, pending.mode.system);
  }

  // Auto-scroll during streaming
  useEffect(() => {
    if (streaming) scrollToBottom();
  }, [messages, streaming, draft]);

  // Esc to stop
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && streaming) {
        e.preventDefault();
        stop();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [streaming]);

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  return (
    <div className="flex flex-col h-screen bg-stone-50 text-stone-900 font-sans">
      <style dangerouslySetInnerHTML={{ __html: PROSE_CSS }} />

      {/* Header */}
      <header
        className="flex-shrink-0 px-5 pt-5 pb-4 flex flex-col items-center justify-center"
        style={{
          position: 'relative',
          background: '#f0ece4',
          borderBottom: '2.5px solid #3a3530',
        }}
      >
        <div className="flex items-center gap-3">
          <MessageSquare size={29} style={{ color: '#9a958e' }} />
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--fg-primary, #1a1a1a)' }}
          >
            {pending?.mode.name || 'Ask on Page'}
          </h1>
          {streaming && (
            <span className="inline-block w-2 h-2 rounded-full bg-stone-400 animate-pulse" />
          )}
        </div>
        {streaming && (
          <button
            onClick={stop}
            className="text-sm rounded-full px-3 py-1.5 cursor-pointer font-medium flex items-center gap-1.5"
            style={{ background: '#e8a050', color: '#fff', border: 'none', position: 'absolute', right: '20px' }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#d08030'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#e8a050'; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="1.5"/></svg>
            Stop
          </button>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {error && (
          <div className="mx-5 text-sm py-2 px-3 rounded-md" style={{ background: '#fef2f2', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <div className="max-w-3xl mx-auto px-6">
          {messages.map((msg, mi) => (
            <div key={mi} className={mi > 0 ? 'mt-5' : ''}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-lg px-4 py-3 text-base askme-prose"
                    style={{ background: '#e8e6df', color: '#1a1a1a' }}
                    dangerouslySetInnerHTML={{ __html: md(msg.blocks.map(b => b.text || '').join('')) }}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  {msg.blocks.map((block, bi) => {
                    if (block.type === 'search' && block.search) {
                      return <SearchBlock key={bi} search={block.search} />;
                    }
                    if (block.type === 'text' && block.text) {
                      return (
                        <div
                          key={bi}
                          className="askme-prose text-base"
                          dangerouslySetInnerHTML={{ __html: md(block.text) }}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          ))}
          {/* Live text for the in-flight turn; replaced by the final message
              (which adds the citations block) when the call resolves. */}
          {streaming && draft && (
            <div className="mt-5">
              <div
                className="askme-prose text-base"
                dangerouslySetInnerHTML={{ __html: md(draft) }}
              />
            </div>
          )}
        </div>

        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 bg-stone-50 px-4 pb-4 pt-2">
        <div
          className="max-w-3xl mx-auto rounded-2xl bg-white border border-stone-200 flex items-end gap-0 overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendFollowUp();
              }
            }}
            placeholder="Write a message..."
            rows={1}
            className="flex-1 px-4 py-3 text-base outline-none resize-none bg-transparent"
            style={{ minHeight: '44px', maxHeight: '120px' }}
            disabled={streaming}
          />
          <button
            onClick={sendFollowUp}
            disabled={streaming || !input.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer disabled:opacity-30 m-1"
            style={{ background: '#e8a050', color: '#fff', transition: 'background 0.12s' }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#d08030'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#e8a050'; }}
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Search citations block ──

function SearchBlock({ search }: { search: WebSearchBlock }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 cursor-pointer"
      >
        <Search size={14} />
        <span>Searched the web</span>
        <ChevronDown
          size={18}
          strokeWidth={2.5}
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s', flexShrink: 0 }}
        />
      </button>

      {open && (
        <div className="mt-2 ml-5 space-y-1">
          <div className="flex items-center gap-2 text-xs text-stone-400 mb-1">
            <Globe size={12} />
            <span className="ml-auto">{search.results.length} results</span>
          </div>
          <div
            className="rounded-md border border-stone-200 bg-white overflow-hidden"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            {search.results.slice(0, 6).map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-stone-50 border-b border-stone-100 last:border-b-0"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <span className="truncate flex-1 mr-3">{r.title}</span>
                <span className="text-xs text-stone-400 flex-shrink-0">{r.domain}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
