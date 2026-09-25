function ChatPage({ theme, isDark }) {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  function handleInputChange(e) {
    const value = e.target.value;

    // Keep the actual text synchronized immediately.
    setInput(value);
  }

  async function send(text) {
    const cleanText = text.trim();

    if (!cleanText || loading) return;

    const next = [
      ...messages,
      {
        role: "user",
        content: cleanText,
      },
    ];

    setMessages(next);
    setStarted(true);
    setInput("");
    setLoading(true);

    try {
      const reply = await askClaude(
        `
You are VANT.

You are an AI work assistant designed to help users understand,
analyze, organize, and accomplish real work.

CORE RULES:

1. Stay directly relevant to the user's request.
2. Use conversation history as context.
3. Never introduce unrelated topics.
4. Never invent information.
5. If information is missing, ask a focused question.
6. Be concise, clear, professional, and useful.
7. Never repeat words or phrases excessively.
8. Never produce corrupted or nonsensical output.
9. Treat requests as work to accomplish, not merely questions to answer.
10. Give actionable results whenever possible.

WORKFLOW:

Understand
→ Analyze
→ Decide
→ Act
→ Report

When handling a complex request:

- Identify the objective.
- Identify known information.
- Identify missing information.
- Analyze the situation.
- Determine what should happen next.
- Give the user an actionable result.

Never claim that you performed an action that you did not actually perform.

You are VANT.
        `,
        next.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      );

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: reply,
        },
      ]);
    } catch (error) {
      console.error("VANT Chat error:", error);

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            "I couldn't complete that request. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);

      // Return focus to the composer after the response.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  function handleSubmit(e) {
    e.preventDefault();

    const text = inputRef.current?.value || input;

    if (!text.trim() || loading) return;

    send(text);
  }

  function handleKeyDown(e) {
    // Enter = send
    // Shift + Enter = new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const suggestions = [
    "Draft a follow-up email to a vendor",
    "Summarize a wall of text I paste in",
    "Help me think through a decision",
  ];

  const inputStyle = {
    padding: "12px 18px",
    borderRadius: 999,
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: 14.5,
    outline: "none",
  };

  if (!started) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
        }}
      >
        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            letterSpacing: 1.5,
            color: theme.textFaint,
            marginBottom: 14,
          }}
        >
          AI CHAT · LIVE
        </p>

        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 32,
            fontWeight: 500,
            margin: "0 0 8px",
            color: theme.text,
          }}
        >
          What should we work on?
        </h1>

        <p
          style={{
            color: theme.textMuted,
            fontSize: 16,
            margin: "0 0 24px",
          }}
        >
          Tell VANT what you need done.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setInput(suggestion);

                requestAnimationFrame(() => {
                  inputRef.current?.focus();
                });
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            width: "min(720px, 100%)",
            display: "flex",
            gap: 10,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, or tell me what you need done…"
            rows={1}
            autoComplete="off"
            spellCheck="true"
            style={{
              ...inputStyle,
              flex: 1,
              resize: "none",
              minHeight: 46,
              maxHeight: 160,
              lineHeight: 1.45,
              fontFamily: "inherit",
            }}
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              width: 46,
              height: 46,
              flexShrink: 0,
              borderRadius: 999,
              background: acBg("violet"),
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor:
                loading || !input.trim()
                  ? "default"
                  : "pointer",
              opacity:
                loading || !input.trim()
                  ? 0.5
                  : 1,
            }}
          >
            <Send
              size={17}
              color={ac("violet", isDark)}
            />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "16px 22px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              letterSpacing: 1.2,
              color: theme.textFaint,
            }}
          >
            VANT · AI CHAT
          </p>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: theme.textMuted,
            }}
          >
            Work session
          </p>
        </div>

        <span
          style={{
            fontSize: 11,
            color: ac("green", isDark),
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          ● LIVE
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            style={{
              alignSelf:
                message.role === "user"
                  ? "flex-end"
                  : "flex-start",
              maxWidth: "78%",
              padding: "11px 15px",
              borderRadius: 14,
              background:
                message.role === "user"
                  ? acBg("violet")
                  : theme.surface,
              border:
                message.role === "user"
                  ? "none"
                  : `1px solid ${theme.border}`,
              color: theme.text,
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {message.content}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "12px 15px",
              borderRadius: 14,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              color: theme.textFaint,
              fontSize: 13,
            }}
          >
            VANT is thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          padding: 18,
          borderTop: `1px solid ${theme.border}`,
          display: "flex",
          gap: 10,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Tell VANT what you need done…"
          rows={1}
          autoComplete="off"
          spellCheck="true"
          disabled={loading}
          style={{
            ...inputStyle,
            flex: 1,
            resize: "none",
            minHeight: 46,
            maxHeight: 160,
            lineHeight: 1.45,
            fontFamily: "inherit",
            opacity: loading ? 0.6 : 1,
          }}
        />

        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: 999,
            background: acBg("violet"),
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor:
              loading || !input.trim()
                ? "default"
                : "pointer",
            opacity:
              loading || !input.trim()
                ? 0.5
                : 1,
          }}
        >
          <Send
            size={17}
            color={ac("violet", isDark)}
          />
        </button>
      </form>
    </div>
  );
}
