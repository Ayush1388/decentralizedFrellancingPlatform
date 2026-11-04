import { useCallback, useEffect, useRef, useState } from "react";
import { api, downloadProtectedFile, fetchProtectedBlobUrl, openProtectedFile } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { refreshUnread } from "../../lib/useUnread";
import { Button, ErrorNote, Icon } from "../ui";

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,application/zip,text/plain,.txt,.md,.csv,.json";

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// An image attachment, fetched with the login token and shown inline. Falls back to a plain chip if it cannot load.
function ImageAttachment({ att, onOpen }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    let url = "";
    fetchProtectedBlobUrl(att.url)
      .then((u) => {
        url = u;
        if (live) setSrc(u);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [att.url]);
  if (!src)
    return (
      <button type="button" onClick={onOpen} className="flex h-24 w-40 items-center justify-center bg-black/30 text-xs text-muted">
        <Icon name="image" size={16} className="mr-1" /> {att.name}
      </button>
    );
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${att.name}`} className="block overflow-hidden border border-white/10">
      <img src={src} alt={att.name} className="max-h-48 max-w-full object-contain" />
    </button>
  );
}

function Attachments({ list, mine }) {
  const [error, setError] = useState("");
  if (!list?.length) return null;
  async function open(att) {
    setError("");
    try {
      if (att.mime === "application/zip") await downloadProtectedFile(att.url, att.name);
      else await openProtectedFile(att.url);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className={`mt-1 flex max-w-[85%] flex-col gap-1.5 ${mine ? "items-end" : "items-start"}`}>
      {list.map((att) =>
        att.mime.startsWith("image/") ? (
          <ImageAttachment key={att.id} att={att} onOpen={() => open(att)} />
        ) : (
          <button
            key={att.id}
            type="button"
            onClick={() => open(att)}
            className="flex items-center gap-2 border border-[#3a3733] bg-black/30 px-3 py-2 text-left text-xs hover:border-gold"
          >
            <Icon name={att.mime === "application/zip" ? "download" : "file"} size={14} className="text-gold" />
            <span className="max-w-48 truncate">{att.name}</span>
            <span className="text-muted">{kb(att.size)}</span>
          </button>
        ),
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

// A conversation: the job chat after hiring, or the client-applicant thread before it. Text plus up to 3 files per message.
export default function Thread({ path, user, title = "Messages", empty = "No messages yet. Say hello.", id, compact, readOnly, starters = [] }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef(null);
  const picker = useRef(null);

  const load = useCallback(
    () =>
      api(path)
        .then((m) => {
          setMessages(m);
          refreshUnread(); // loading a conversation marks it read on the server
        })
        .catch(() => {}),
    [path],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  function pick(e) {
    const chosen = [...e.target.files];
    e.target.value = "";
    setError("");
    const next = [...files, ...chosen];
    if (next.length > MAX_FILES) return setError(`Attach up to ${MAX_FILES} files per message.`);
    const big = next.find((f) => f.size > MAX_BYTES);
    if (big) return setError(`${big.name} is over 10 MB.`);
    setFiles(next);
  }

  async function send(e) {
    e.preventDefault();
    if ((!text.trim() && files.length === 0) || sending) return;
    setSending(true);
    try {
      let body;
      if (files.length) {
        body = new FormData();
        body.append("body", text);
        files.forEach((f) => body.append("files", f));
      } else body = { body: text };
      const m = await api(path, { method: "POST", body });
      setMessages((ms) => [...ms, m]);
      setText("");
      setFiles([]);
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
      <div className={`${compact ? "max-h-64" : "max-h-96"} min-h-20 space-y-3 overflow-y-auto pr-1`} role="log" aria-live="polite">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-muted">{empty}</p>}
        {messages.map((m) => {
          const mine = m.sender.id === user?.id;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {m.body && <p className={`max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2 text-sm ${mine ? "bg-gold text-poster" : "bg-sage"}`}>{m.body}</p>}
              <Attachments list={m.attachments} mine={mine} />
              <span className="mt-0.5 text-[11px] text-muted">
                {mine ? "You" : m.sender.name} · {timeAgo(m.createdAt)}
              </span>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {readOnly ? (
        <p className="mt-3 border border-dashed border-white/10 px-3 py-2 text-xs text-muted">You are reading this conversation as the arbiter. It is read only.</p>
      ) : (
        <form onSubmit={send} className="mt-3 space-y-2">
          {starters.length > 0 && messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="border border-[#3a3733] px-2.5 py-1 text-xs text-ink-soft hover:border-gold hover:text-gold">
                  {s}
                </button>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs">
                  <Icon name="paperclip" size={12} />
                  <span className="max-w-40 truncate">{f.name}</span>
                  <span className="text-muted">{kb(f.size)}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted hover:text-red-700">
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input ref={picker} type="file" multiple accept={ACCEPT} onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              aria-label="Attach files"
              title="Attach up to 3 files (images, PDF, ZIP, text), 10 MB each"
              className="flex min-h-11 w-11 shrink-0 items-center justify-center border border-[#3a3733] hover:border-gold hover:text-gold"
            >
              <Icon name="paperclip" size={18} />
            </button>
            <label htmlFor={inputId} className="sr-only">
              Message
            </label>
            <input id={inputId} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Write a message" className="input" />
            <Button type="submit" aria-label="Send message" loading={sending} className="!px-4">
              <Icon name="send" size={18} />
            </Button>
          </div>
        </form>
      )}
      <div className="mt-2">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}
