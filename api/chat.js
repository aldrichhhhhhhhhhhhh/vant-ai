export const config = {
  maxDuration: 60,
};

import { createClient } from "@supabase/supabase-js";

const MODEL = "openai/gpt-oss-20b";
const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const MAX_REQUEST_CHARS = 4_000_000;
const MAX_MESSAGES = 40;

// Keep NVIDIA slightly below the Vercel function limit.
// This gives VANT a small amount of time to finish the response cleanly.
const NVIDIA_TIMEOUT_MS = 55_000;

function json(res, status, body) {
  return res.status(status).json(body);
}

/* =========================================================
   MESSAGE VALIDATION
   ========================================================= */

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
  if (!item || typeof item !== "object") {
    return false;
  }

  if (item.type === "text") {
    return typeof item.text === "string";
  }

  return isValidImageUrlItem(item);
}

function isValidMessage(message) {
  if (!message || typeof message !== "object") {
    return false;
  }

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
      message.content.some(
        (part) => part?.type === "image_url"
      )
  );
}

/* =========================================================
   VANT ADAPTIVE TEMPERATURE ENGINE
   ========================================================= */

function getVantTemperature(messages, hasImage) {
  // Images require more deterministic interpretation.
  if (hasImage) {
    return 0.25;
  }

  const userMessages = messages.filter(
    (message) => message?.role === "user"
  );

  const latestUser =
    userMessages[userMessages.length - 1];

  const latestText = Array.isArray(latestUser?.content)
    ? latestUser.content
        .filter((part) => part?.type === "text")
        .map((part) => part.text || "")
        .join(" ")
    : String(latestUser?.content || "");

  const text = latestText
    .toLowerCase()
    .trim();

  /* ---------------------------------------------------------
     CALCULATION
     --------------------------------------------------------- */

  const calculationSignals = [
    "calculate",
    "calculation",
    "compute",
    "equation",
    "formula",
    "percentage",
    "percent",
    "math",
    "how much",
    "how many",
    "sum",
    "average",
    "total",
  ];

  /* ---------------------------------------------------------
     TECHNICAL
     --------------------------------------------------------- */

  const technicalSignals = [
    "sql",
    "postgres",
    "postgresql",
    "javascript",
    "typescript",
    "react",
    "python",
    "code",
    "coding",
    "debug",
    "debugging",
    "error",
    "api",
    "database",
    "query",
    "function",
    "algorithm",
    "regex",
    "json",
  ];

  /* ---------------------------------------------------------
     ANALYTICAL
     --------------------------------------------------------- */

  const analyticalSignals = [
    "analyze",
    "analysis",
    "compare",
    "comparison",
    "evaluate",
    "investigate",
    "root cause",
    "problem",
    "issue",
    "why",
    "strategy",
    "plan",
    "decision",
    "risk",
    "pros and cons",
    "tradeoff",
    "trade-off",
    "recommendation",
    "recommendations",
  ];

  /* ---------------------------------------------------------
     CREATIVE
     --------------------------------------------------------- */

  const creativeSignals = [
    "brainstorm",
    "brainstorming",
    "creative",
    "creatively",
    "ideas",
    "idea",
    "imagine",
    "invent",
    "innovative",
    "innovation",
    "campaign",
    "slogan",
    "tagline",
    "name ideas",
    "names",
    "story",
    "storytelling",
    "design",
    "concept",
    "concepts",
    "creative writing",
    "make it catchy",
    "make it unique",
    "think outside",
  ];

  /* ---------------------------------------------------------
     WRITING
     --------------------------------------------------------- */

  const writingSignals = [
    "write",
    "rewrite",
    "rephrase",
    "draft",
    "email",
    "message",
    "post",
    "caption",
    "announcement",
    "presentation",
    "script",
    "copywriting",
  ];

  /* ---------------------------------------------------------
     SCORE
     --------------------------------------------------------- */

  const countMatches = (signals) =>
    signals.reduce(
      (score, signal) =>
        score + (text.includes(signal) ? 1 : 0),
      0
    );

  const calculationScore =
    countMatches(calculationSignals);

  const technicalScore =
    countMatches(technicalSignals);

  const analyticalScore =
    countMatches(analyticalSignals);

  const creativeScore =
    countMatches(creativeSignals);

  const writingScore =
    countMatches(writingSignals);

  /* ---------------------------------------------------------
     ENGAGEMENT
     --------------------------------------------------------- */

  const conversationDepth =
    userMessages.length;

  const messageLength =
    text.length;

  const highEngagement =
    conversationDepth >= 4 ||
    messageLength >= 700;

  const exploratoryLanguage =
    /what if|could we|let's|lets|maybe|imagine|how about|another|more ideas/i.test(
      text
    );

  const refinementLanguage =
    /make it|change|improve|expand|more|less|different|another version|try again|refine/i.test(
      text
    );

  /* ---------------------------------------------------------
     DECISION TREE
     --------------------------------------------------------- */

  // Highest precision.
  if (calculationScore > 0) {
    return 0.2;
  }

  // Technical consistency.
  if (technicalScore >= 1) {
    return 0.3;
  }

  // Creative exploration.
  if (creativeScore >= 2) {
    return highEngagement ? 0.9 : 0.8;
  }

  if (
    creativeScore === 1 &&
    exploratoryLanguage
  ) {
    return 0.8;
  }

  // Writing.
  if (writingScore >= 1) {
    return refinementLanguage
      ? 0.8
      : 0.7;
  }

  // Analysis.
  if (analyticalScore >= 2) {
    return 0.45;
  }

  if (analyticalScore === 1) {
    return 0.5;
  }

  // Exploratory conversation.
  if (
    highEngagement &&
    exploratoryLanguage
  ) {
    return 0.7;
  }

  // Refinement.
  if (refinementLanguage) {
    return 0.65;
  }

  // VANT default.
  return 0.6;
}

/* =========================================================
   MAIN API HANDLER
   ========================================================= */

export default async function handler(req, res) {
  /* ---------------------------------------------------------
     METHOD CHECK
     --------------------------------------------------------- */

  if (req.method !== "POST") {
    return json(res, 405, {
      error: "method_not_allowed",
    });
  }

  /* ---------------------------------------------------------
     SUPABASE AUTH
     --------------------------------------------------------- */

  const authHeader =
    req.headers.authorization || "";

  const accessToken =
    authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (
    !supabaseUrl ||
    !supabasePublishableKey
  ) {
    return json(res, 500, {
      error: "supabase_not_configured",
    });
  }

  if (!accessToken) {
    return json(res, 401, {
      error: "authentication_required",
    });
  }

  const supabase = createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const {
    data: userData,
    error: userError,
  } =
    await supabase.auth.getUser(
      accessToken
    );

  if (
    userError ||
    !userData?.user
  ) {
    return json(res, 401, {
      error: "invalid_session",
    });
  }

  /* ---------------------------------------------------------
     ACCESS CODE
     --------------------------------------------------------- */

  const expectedAccessCode =
    process.env.APP_ACCESS_CODE;

  const providedAccessCode =
    req.headers["x-access-code"] || "";

  if (!expectedAccessCode) {
    return json(res, 500, {
      error: "access_not_configured",
    });
  }

  if (
    providedAccessCode !==
    expectedAccessCode
  ) {
    return json(res, 401, {
      error: "invalid_access_code",
    });
  }

  /* ---------------------------------------------------------
     NVIDIA API KEY
     --------------------------------------------------------- */

  const apiKey =
    process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return json(res, 500, {
      error: "missing_api_key",
    });
  }

  /* ---------------------------------------------------------
     REQUEST BODY
     --------------------------------------------------------- */

  const {
    system,
    messages,
    model = MODEL,
    max_tokens = null,
    stream = false,
  } = req.body || {};

  // Unified VANT engine: all AI Chat requests use GPT-OSS 20B.
  // Ignore legacy model hints from older clients.
  const requestedModel = MODEL;

  if (
    system !== undefined &&
    typeof system !== "string"
  ) {
    return json(res, 400, {
      error: "invalid_system_prompt",
    });
  }

  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    return json(res, 400, {
      error: "invalid_messages",
    });
  }

  if (
    messages.length >
    MAX_MESSAGES
  ) {
    return json(res, 413, {
      error: "too_many_messages",
    });
  }

  if (
    typeof stream !== "boolean"
  ) {
    return json(res, 400, {
      error: "invalid_stream_flag",
    });
  }

  /* ---------------------------------------------------------
     MESSAGE VALIDATION
     --------------------------------------------------------- */

  const validMessages =
    messages.filter(
      isValidMessage
    );

  if (
    validMessages.length !==
    messages.length
  ) {
    return json(res, 400, {
      error: "invalid_message_format",
    });
  }

  /* ---------------------------------------------------------
     MULTIMODAL DETECTION
     --------------------------------------------------------- */

  const hasImage =
    containsImage(
      validMessages
    );

  /* ---------------------------------------------------------
     BUILD NVIDIA REQUEST
     --------------------------------------------------------- */

  let payload;

  try {
    payload = {
      model: requestedModel,

      messages: [
        ...(system
          ? [
              {
                role: "system",
                content: system,
              },
            ]
          : []),
        ...validMessages,
      ],

      temperature: 0.6,

      top_p: 0.7,

      /*
       * Keep responses fast enough for Vercel.
       * 4096 was contributing to long-running requests.
       */
      max_tokens:
        Number.isFinite(Number(max_tokens))
          ? Math.max(64, Math.min(2048, Number(max_tokens)))
          : hasImage
            ? 900
            : 2048,

      stream,

      // Keep reasoning light for responsive everyday work.
      reasoning_effort: "low",
    };
  } catch {
    return json(res, 400, {
      error: "invalid_payload",
    });
  }

  /* ---------------------------------------------------------
     PAYLOAD SIZE PROTECTION
     --------------------------------------------------------- */

  const serialized =
    JSON.stringify(payload);

  if (
    serialized.length >
    MAX_REQUEST_CHARS
  ) {
    return json(res, 413, {
      error: "payload_too_large",
    });
  }

  /* ---------------------------------------------------------
     NVIDIA NIM REQUEST
     --------------------------------------------------------- */

  let response;

  try {
    response = await fetch(
      NVIDIA_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",

          Accept: stream
            ? "text/event-stream"
            : "application/json",
        },

        body: serialized,

        signal:
          AbortSignal.timeout(
            NVIDIA_TIMEOUT_MS
          ),
      }
    );
  } catch (err) {
    if (
      err?.name ===
        "TimeoutError" ||
      err?.name ===
        "AbortError"
    ) {
      console.error(
        "VANT NVIDIA timeout"
      );

      return json(res, 504, {
        error: "nvidia_timeout",

        detail:
          "NVIDIA NIM did not begin responding within 55 seconds.",
      });
    }

    console.error(
      "VANT NVIDIA connection error:",
      err
    );

    return json(res, 502, {
      error:
        "nvidia_connection_failed",

      detail:
        "Could not connect to NVIDIA NIM.",
    });
  }

  /* ---------------------------------------------------------
     NVIDIA ERROR
     --------------------------------------------------------- */

  if (!response.ok) {
    let data = {};

    try {
      data =
        await response.json();
    } catch {
      // Ignore JSON parse failure.
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
        error:
          "nvidia_api_error",

        detail,
      }
    );
  }

  /* =========================================================
     STREAMING RESPONSE
     ========================================================= */

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
      typeof res.flushHeaders ===
      "function"
    ) {
      res.flushHeaders();
    }

    if (!response.body) {
      res.write(
        `data: ${JSON.stringify({
          error: "empty_stream",
        })}\n\n`
      );

      res.write(
        "data: [DONE]\n\n"
      );

      return res.end();
    }

    const reader =
      response.body.getReader();

    const decoder =
      new TextDecoder();

    try {
      while (true) {
        const {
          value,
          done,
        } = await reader.read();

        if (done) {
          break;
        }

        const chunk =
          decoder.decode(
            value,
            {
              stream: true,
            }
          );

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
            error:
              "stream_interrupted",
          })}\n\n`
        );
      } catch {
        // Client disconnected.
      }
    } finally {
      try {
        res.write(
          "data: [DONE]\n\n"
        );
      } catch {
        // Client disconnected.
      }

      res.end();
    }

    return;
  }

  /* =========================================================
     NON-STREAMING FALLBACK
     ========================================================= */

  let data;

  try {
    data =
      await response.json();
  } catch {
    return json(res, 502, {
      error:
        "invalid_nvidia_response",

      detail:
        "NVIDIA NIM returned a response that could not be parsed as JSON.",
    });
  }

  const content =
    data?.choices?.[0]
      ?.message?.content;

  if (
    typeof content !==
      "string" ||
    !content.trim()
  ) {
    console.error(
      "VANT empty NVIDIA response:",
      data
    );

    return json(res, 502, {
      error:
        "empty_model_response",

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

    model: requestedModel,
  });
}