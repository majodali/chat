import { useRef, useState } from "react";

export function Composer({
  onSendText,
  onSendImage,
  onTyping,
}: {
  onSendText: (text: string) => void;
  onSendImage: (file: File) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>();

  function signalTyping() {
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      typingRef.current = false;
      onTyping(false);
    }, 2000);
  }

  function stopTyping() {
    clearTimeout(stopTimer.current);
    if (typingRef.current) {
      typingRef.current = false;
      onTyping(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSendText(value);
    setText("");
    stopTyping();
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onSendImage(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickFile}
      />
      <button
        type="button"
        className="icon-btn attach-btn"
        title="Send a picture"
        onClick={() => fileRef.current?.click()}
      >
        📷
      </button>
      <input
        className="composer-input"
        value={text}
        placeholder="Type a message…"
        onChange={(e) => {
          setText(e.target.value);
          signalTyping();
        }}
        onBlur={stopTyping}
      />
      <button type="submit" className="send-btn" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
