const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";
const TOTAL_BUDGET_MS = 54_000;
const MAX_PASSES = 2;
const MAX_OUTPUT_TOKENS = 8192;

function continuationMessages(baseMessages, answer) {
  if (!answer) return [...baseMessages];
  return [
    ...baseMessages,
    { role: "assistant", content: answer },
    {
      role: "user",
      content:
        "Continue from exactly where the previous answer stopped. Do not repeat earlier text. Finish the remaining sections and give the answer a clear ending.",
    },
  ];
}

const MAX_CONTEXT_MESSAGES = 14;
const MAX_CONTEXT_TEXT_CHARS = 32_000;
const MAX_MESSAGE_TEXT_CHARS = 12_000;

function contentTextLength(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, part) => {
    if (typeof part?.text === "string") return sum + part.text.length;
    return sum;
  }, 0);
}

function trimMessageContent(content, maxChars) {
  if (typeof content === "string") {
    return content.length > maxChars
      ? `[Earlier content trimmed to fit the model context.]\\n${content.slice(-maxChars)}`
      : content;
  }
  if (!Array.isArray(content)) return content;

  // Preserve image_url parts; trim only text parts, starting with the newest text.
  let remaining = maxChars;
  const reversed = [...content].reverse().map((part) => {
    if (part?.type !== "text" || typeof part.text !== "string") return part;
    const text = part.text;
    if (text.length <= remaining) {
      remaining -= text.length;
      return part;
    }
    const kept = text.slice(-Math.max(0, remaining));
    remaining = 0;
    return { ...part, text: `[Earlier text trimmed.]\\n${kept}` };
  });
  return reversed.reverse();
}

function fitMessagesToContext(messages) {
  const systemMessages = messages.filter((message) => message?.role === "system");
  const conversationMessages = messages.filter((message) => message?.role !== "system");
  const recentMessages = conversationMessages.slice(-(MAX_CONTEXT_MESSAGES - systemMessages.length));
  const selected = [...systemMessages, ...recentMessages];

  let remaining = MAX_CONTEXT_TEXT_CHARS - systemMessages.reduce(
    (sum, message) => sum + contentTextLength(message.content), 0
  );
  for (let i = selected.length - 1; i >= systemMessages.length; i -= 1) {
    if (remaining <= 0) {
      selected[i] = { ...selected[i], content: trimMessageContent(selected[i].content, 0) };
      continue;
    }
    const length = contentTextLength(selected[i].content);
    const allowance = Math.min(MAX_MESSAGE_TEXT_CHARS, remaining);
    if (length > allowance) {
      selected[i] = {
        ...selected[i],
        content: trimMessageContent(selected[i].content, allowance),
      };
    }
    remaining -= Math.min(length, allowance);
  }
  return selected;
}

function providerPayload(messages, options = {}) {
  return {
    model: MODEL,
    messages: fitMessagesToContext(messages),
    temperature: options.temperature ?? 0.6,
    top_p: options.top_p ?? 0.7,
    max_tokens: options.max_tokens ?? MAX_OUTPUT_TOKENS,
    reasoning_effort: options.reasoning_effort ?? "low",
    stream: Boolean(options.stream),
  };
}

async function requestNim(apiKey, payload, timeoutMs) {
  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: payload.stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Math.max(1000, timeoutMs)),
  });

  if (!response.ok) {
    let detail = `NVIDIA NIM returned HTTP ${response.status}.`;
    try {
      const data = await response.json();
      detail = data?.error?.message || data?.detail || data?.message || detail;
    } catch {}
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response;
}

function parseSseEvent(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try { return JSON.parse(data); } catch { return null; }
}

async function readStreamPass(response, onDelta) {
  if (!response.body) throw new Error("NVIDIA returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason = null;
  let usage = null;

  const consume = (block) => {
    const event = parseSseEvent(block);
    if (!event) return;
    const choice = event.choices?.[0];
    const piece = typeof choice?.delta?.content === "string"
      ? choice.delta.content
      : typeof choice?.text === "string" ? choice.text : "";
    if (piece) {
      text += piece;
      onDelta?.(piece);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (event.usage) usage = event.usage;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) consume(block);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  return { text, finishReason, usage };
}

export async function completeVant(apiKey, messages, options = {}) {
  const startedAt = Date.now();
  const answerParts = [];
  let finishReason = null;
  let usage = null;
  let passes = 0;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 1500) break;
    const response = await requestNim(
      apiKey,
      providerPayload(continuationMessages(messages, answerParts.join("\n\n")), {
        ...options,
        stream: false,
      }),
      remaining
    );
    const data = await response.json();
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("GPT-OSS returned no visible answer content.");
    }
    answerParts.push(content.trim());
    finishReason = choice?.finish_reason || null;
    usage = data?.usage || usage;
    passes = pass + 1;
    if (finishReason !== "length") {
      return {
        text: answerParts.join("\n\n"),
        model: MODEL,
        finish_reason: finishReason,
        completion_passes: passes,
        usage,
      };
    }
  }

  const error = new Error(
    "VANT detected that the answer did not finish within its response budget. Please retry or split the request into smaller parts."
  );
  error.code = "response_incomplete";
  throw error;
}

export async function streamVant(apiKey, messages, res, options = {}) {
  const startedAt = Date.now();
  const answerParts = [];
  let finishReason = null;
  let usage = null;
  let passes = 0;
  let sentDone = false;

  const send = (event) => {
    if (!res.destroyed && !res.writableEnded) {
      const data = event === "[DONE]" ? "[DONE]" : JSON.stringify(event);
      res.write(`data: ${data}\n\n`);
    }
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  try {
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remaining < 1500) break;

      const response = await requestNim(
        apiKey,
        providerPayload(continuationMessages(messages, answerParts.join("\n\n")), {
          ...options,
          stream: true,
        }),
        remaining
      );
      const result = await readStreamPass(response, (piece) => {
        send({ choices: [{ delta: { content: piece }, finish_reason: null }] });
      });

      if (!result.text.trim()) {
        throw new Error("GPT-OSS returned no visible answer content.");
      }
      answerParts.push(result.text);
      finishReason = result.finishReason;
      usage = result.usage || usage;
      passes = pass + 1;

      if (finishReason !== "length") {
        send({
          choices: [{ delta: {}, finish_reason: finishReason || "stop" }],
          model: MODEL,
          usage,
          completion_passes: passes,
        });
        sendDone = true;
        send("[DONE]");
        return;
      }
    }

    const error = new Error(
      "VANT could not finish this response within its time budget. Please retry or split the request into smaller parts."
    );
    error.code = "response_incomplete";
    throw error;
  } catch (error) {
    console.error("VANT unified stream engine error:", error);
    send({
      error: error.code || "stream_interrupted",
      detail: error.message || "The response was interrupted before completion.",
      partial: answerParts.length > 0,
    });
    sendDone = true;
    send("[DONE]");
  } finally {
    if (!sendDone) send("[DONE]");
    if (!res.writableEnded) res.end();
  }
}
