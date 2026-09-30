export const config = { maxDuration: 60 };

import { createClient } from "@supabase/supabase-js";

const MODEL = "google/gemma-4-31b-it";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const MAX_REQUEST_CHARS = 4_000_000;
const MAX_MESSAGES = 40;

function json(res, status, body) {
  return res.status(status).json(body);
}

function isValidImageUrlItem(item) {
  return Boolean(
    item &&
      item.type === "image_url" &&
      item.image_url &&
      typeof item.image_url.url === "string" &&
      item.image_url.url.startsWith("data:image/")
  );
}

function isValidContentPart(item) {
  if (!item || typeof item !== "object") return false;

  if (item.type === "text") {
    return typeof item.text === "string";
  }

  return isValidImageUrlItem(item);
}

function isValidMessage(message) {
  if (!message || typeof message !== "object") return false;

  if (!["system", "user", "assistant"].includes(message.role)) {
    return false;
  }

  if (typeof message.content === "string") {
    return true;
  }

  if (Array.isArray(message.content)) {
    return (
      message.content.length > 0 &&
      message.content.every(isValidContentPart)
    );
  }

  return false;
}

function containsImage(messages) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === "image_url")
  );
}

export default async function handler(req, res) {
  // ---------------------------------------------------------
  // METHOD CHECK
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    return json(res, 405, {
      error: "method_not_allowed",
    });
  }

  // ---------------------------------------------------------
  // SUPABASE AUTH
  // ---------------------------------------------------------

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return json(res, 500, {
      error: "supabase_not_configured",
    });
  }

  if (!accessToken) {
    return json(res, 401, {
      error: "authentication_required",
    });
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return json(res, 401, {
      error: "invalid_session",
    });
  }

  // ---------------------------------------------------------
  // ACCESS CODE
  // ---------------------------------------------------------

  const expectedAccessCode = process.env.APP_ACCESS_CODE;
  const providedAccessCode = req.headers["x-access-code"] || "";

  if (!expectedAccessCode) {
    return json(res, 500, {
      error: "access_not_configured",
    });
  }

  if (providedAccessCode !== expectedAccessCode) {
    return json(res, 401, {
      error: "invalid_access_code",
    });
  }

  // ---------------------------------------------------------
  // NVIDIA API KEY
  // ---------------------------------------------------------

  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return json(res, 500, {
      error: "missing_api_key",
    });
  }

  // ---------------------------------------------------------
  // REQUEST BODY
  // ---------------------------------------------------------

  const { system, messages } = req.body || {};

  if (system !== undefined && typeof system !== "string") {
    return json(res, 400, {
      error: "invalid_system_prompt",
    });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return json(res, 400, {
      error: "invalid_messages",
    });
  }

  if (messages.length > MAX_MESSAGES) {
    return json(res, 413, {
      error: "too_many_messages",
    });
  }

  // ---------------------------------------------------------
  // MESSAGE VALIDATION
  // ---------------------------------------------------------

  const validMessages = messages.filter(isValidMessage);

  if (validMessages.length !== messages.length) {
    return json(res, 400, {
      error: "invalid_message_format",
    });
  }

  // ---------------------------------------------------------
  // DETECT MULTIMODAL REQUEST
  // ---------------------------------------------------------

  const hasImage = containsImage(validMessages);

  // ---------------------------------------------------------
  // BUILD NVIDIA REQUEST
  // ---------------------------------------------------------

  const { stream = false } = req.body || {};

  if (typeof stream !== "boolean") {
    return json(res, 400, {
      error: "invalid_stream_flag",
    });
  }

  let payload;

  try {
    payload = {
      model: MODEL,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...validMessages,
      ],
      temperature: hasImage ? 0.25 : 0.7,
      top_p: 0.95,
      top_k: 64,
      max_tokens: hasImage ? 900 : 4096,
      stream,
      chat_template_kwargs: {
        enable_thinking: !hasImage,
      },
    };
  } catch {
    return json(res, 400, {
      error: "invalid_payload",
    });
  }

  // ---------------------------------------------------------
  // PAYLOAD SIZE PROTECTION
  // ---------------------------------------------------------

  const serialized = JSON.stringify(payload);

  if (serialized.length > MAX_REQUEST_CHARS) {
    return json(res, 413, {
      error: "payload_too_large",
    });
  }

  // ---------------------------------------------------------
  // CALL NVIDIA NIM
  // ---------------------------------------------------------

  let response;

  try {
    response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: stream
          ? "text/event-stream"
          : "application/json",
      },
      body: serialized,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (
      err?.name === "TimeoutError" ||
      err?.name === "AbortError"
    ) {
      return json(res, 504, {
        error: "nvidia_timeout",
        detail:
          "NVIDIA NIM did not respond within 60 seconds.",
      });
    }

    console.error(
      "VANT NVIDIA connection error:",
      err
    );

    return json(res, 502, {
      error: "nvidia_connection_failed",
      detail:
        "Could not connect to NVIDIA NIM.",
    });
  }

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      /* ignore */
    }

    const detail =
      data?.error?.message ||
      data?.detail ||
      data?.message ||
      `NVIDIA NIM returned HTTP ${response.status}.`;

    console.error(
      "VANT NVIDIA API error:",
      response.status,
      data
    );

    return json(
      res,
      response.status >= 400 &&
        response.status < 500
        ? response.status
        : 502,
      {
        error: "nvidia_api_error",
        detail,
      }
    );
  }

  // ---------------------------------------------------------
  // STREAMING RESPONSE
  // ---------------------------------------------------------

  if (stream) {
    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    if (
      typeof res.flushHeaders === "function"
    ) {
      res.flushHeaders();
    }

    if (!response.body) {
      res.write(
        `data: ${JSON.stringify({
          error: "empty_stream",
        })}\n\n`
      );

      res.write("data: [DONE]\n\n");

      return res.end();
    }

    const reader =
      response.body.getReader();

    const decoder =
      new TextDecoder();

    try {
      while (true) {
        const { value, done } =
          await reader.read();

        if (done) break;

        const chunk =
          decoder.decode(value, {
            stream: true,
          });

        if (chunk) {
          res.write(chunk);
        }
      }
    } catch (err) {
      console.error(
        "VANT stream error:",
        err
      );

      try {
        res.write(
          `data: ${JSON.stringify({
            error: "stream_interrupted",
          })}\n\n`
        );
      } catch {
        /* client disconnected */
      }
    } finally {
      try {
        res.write(
          "data: [DONE]\n\n"
        );
      } catch {
        /* client disconnected */
      }

      res.end();
    }

    return;
  }

  // ---------------------------------------------------------
  // NON-STREAMING RESPONSE
  // ---------------------------------------------------------

  let data;

  try {
    data = await response.json();
  } catch {
    return json(res, 502, {
      error: "invalid_nvidia_response",
      detail:
        "NVIDIA NIM returned a response that could not be parsed as JSON.",
    });
  }

  const content =
    data?.choices?.[0]?.message?.content;

  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
    console.error(
      "VANT empty NVIDIA response:",
      data
    );

    return json(res, 502, {
      error: "empty_model_response",
      detail:
        "The model returned no text content.",
    });
  }

  return json(res, 200, {
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    model: MODEL,
  });
}
