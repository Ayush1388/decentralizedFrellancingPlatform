import { useEffect, useRef } from "react";

// Cloudflare Turnstile "are you human" check. Renders nothing when the site has no key configured.
let scriptPromise;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function Turnstile({ siteKey, onToken }) {
  const box = useRef(null);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: (t) => onToken(t),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (id !== undefined && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, onToken]);
  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
