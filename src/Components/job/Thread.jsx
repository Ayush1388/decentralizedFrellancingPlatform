import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { Button, ErrorNote, Icon } from "../ui";

// A conversation: the job chat after hiring, or the client-applicant thread before it.
export default function Thread({ path, user, title = "Messages", empty = "No messages yet. Say hello.", id, compact }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef(null);

  const load = useCallback(() => api(path).then(setMessages).catch(() => {}), [path]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const m = await api(path, { method: "POST", body: { body: text } });
      setMessages((ms) => [...ms, m]);
      setText("");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const inputId = `${id || path}-input`;
  return (
    <section id={id} className={`flex scroll-mt-24 flex-col ${compact ? "" : "card p-5"}`} aria-label={title}>
      {!compact && (
        <h2 className="poster-title mb-3 flex items-center gap-2 text-2xl">
          <Icon name="chat" size={18} /> {title}
        </h2>
      )}
      <div className={`${compact ? "max-h-56" : "max-h-80"} min-h-20 space-y-3 overflow-y-auto pr-1`} role="log" aria-live="polite">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-muted">{empty}</p>}
        {messages.map((m) => {
          const mine = m.sender.id === user?.id;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2 text-sm ${mine ? "bg-gold text-poster" : "bg-sage"}`}>{m.body}</p>
              <span className="mt-0.5 text-[11px] text-muted">
                {mine ? "You" : m.sender.name} · {timeAgo(m.createdAt)}
              </span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <input id={inputId} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Write a message" className="input" />
        <Button type="submit" aria-label="Send message" loading={sending} className="!px-4">
          <Icon name="send" size={18} />
        </Button>
      </form>
      <div className="mt-2">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}
