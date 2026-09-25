export default async function handler(req, res) {
  // ------------------------------------------------------------
  // VANT AI API
  // Model: Google Gemma 4 31B IT
  // Provider: NVIDIA NIM
  // ------------------------------------------------------------

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Only POST requests are allowed.",
    });
  }

  // ------------------------------------------------------------
  // ENVIRONMENT
  // ------------------------------------------------------------

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const APP_ACCESS_CODE = process.env.APP_ACCESS_CODE;

  // ------------------------------------------------------------
  // ACCESS CONTROL
  // ------------------------------------------------------------

  if (!APP_ACCESS_CODE) {
    return res.status(500).json({
      error: "access_not_configured",
      message: "APP_ACCESS_CODE is not configured.",
    });
  }

  const providedAccessCode = req.headers["x-access-code"] || "";

  if (providedAccessCode !== APP_ACCESS_CODE) {
    return res.status(401).json({
      error: "invalid_access_code",
      message: "Invalid or missing access code.",
    });
  }

  // ------------------------------------------------------------
  // NVIDIA API KEY
  // ------------------------------------------------------------

  if (!NVIDIA_API_KEY) {
    return res.status(500).json({
      error: "missing_api_key",
      message: "NVIDIA_API_KEY is not configured.",
    });
  }

  // ------------------------------------------------------------
  // REQUEST VALIDATION
  // ------------------------------------------------------------

  const body = req.body || {};

  const system =
    typeof body.system === "string" && body.system.trim()
      ? body.system.trim()
      : `
You are VANT.

VANT is an AI work platform designed to help users understand,
analyze, organize, and accomplish real work.

CORE BEHAVIOR:

1. Stay directly relevant to the user's request.
2. Use the conversation history as context.
3. Never introduce unrelated topics.
4. Never invent information that is not available.
5. If information is missing, ask a focused question.
6. Be concise, clear, professional, and useful.
7. Do not repeat words, phrases, or sections unnecessarily.
8. Do not produce corrupted, repetitive, or nonsensical output.
9. Treat the user's request as work to accomplish, not merely a question to answer.
10. When appropriate, provide concrete next steps.

VANT WORKFLOW:

Understand
→ Analyze
→ Decide
→ Act
→ Report

When handling a complex request:

- Identify the objective.
- Identify the known information.
- Identify missing information.
- Analyze the situation.
- Determine what should happen next.
- Give the user an actionable result.

Do not claim to have performed an action that you did not actually perform.

You are VANT.
`;

  const messages = Array.isArray(body.messages)
    ? body.messages
    : null;

  if (!messages) {
    return res.status(400).json({
      error: "invalid_messages",
      message: "messages must be an array.",
    });
  }

  // ------------------------------------------------------------
  // BASIC MESSAGE VALIDATION
  // ------------------------------------------------------------

  const cleanedMessages = messages
    .filter(
      (message) =>
        message &&
        typeof message === "object" &&
        typeof message.role === "string" &&
        typeof message.content !== "undefined"
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  if (cleanedMessages.length === 0) {
    return res.status(400).json({
      error: "empty_messages",
      message: "No valid messages were provided.",
    });
  }

  // ------------------------------------------------------------
  // PAYLOAD PROTECTION
  // ------------------------------------------------------------

  const approximatePayloadSize =
    JSON.stringify({
      system,
      messages: cleanedMessages,
    }).length;

  // Prevent excessively large browser requests from reaching NIM.
  // This is intentionally generous for VANT's current prototype.
  const MAX_PAYLOAD_SIZE = 500000;

  if (approximatePayloadSize > MAX_PAYLOAD_SIZE) {
    return res.status(413).json({
      error: "payload_too_large",
      message:
        "The request is too large. Try a smaller message or fewer attachments.",
    });
  }

  // ------------------------------------------------------------
  // NVIDIA NIM REQUEST
  // ------------------------------------------------------------

  const payload = {
    model: "google/gemma-4-31b-it",

    messages: [
      {
        role: "system",
        content: system,
      },
      ...cleanedMessages,
    ],

    // Gemma 4 recommended sampling configuration
    temperature: 1,
    top_p: 0.95,
    top_k: 64,

    // Give VANT enough room for useful reasoning and work responses
    max_tokens: 4096,

    // VANT currently uses normal request/response mode
    stream: false,

    // Enable Gemma's thinking mode
    chat_template_kwargs: {
      enable_thinking: true,
    },
  };

  // ------------------------------------------------------------
  // CALL NVIDIA NIM
  // ------------------------------------------------------------

  let response;

  try {
    response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: JSON.stringify(payload),

        // Abort the NVIDIA request after 60 seconds
        signal: AbortSignal.timeout(60000),
      }
    );
  } catch (error) {
    console.error("VANT NVIDIA request failed:", error);

    if (error?.name === "TimeoutError") {
      return res.status(504).json({
        error: "model_timeout",
        message: "The model took too long to respond.",
      });
    }

    return res.status(502).json({
      error: "nvidia_connection_failed",
      message: "Unable to reach NVIDIA NIM.",
      detail: error?.message || "Unknown connection error.",
    });
  }

  // ------------------------------------------------------------
  // READ NVIDIA RESPONSE
  // ------------------------------------------------------------

  let data;

  try {
    data = await response.json();
  } catch (error) {
    console.error("VANT could not parse NVIDIA response:", error);

    return res.status(502).json({
      error: "invalid_model_response",
      message: "The model returned an invalid response.",
    });
  }

  // ------------------------------------------------------------
  // NVIDIA ERROR
  // ------------------------------------------------------------

  if (!response.ok) {
    console.error("VANT NVIDIA API error:", data);

    return res.status(response.status).json({
      error: "nvidia_api_error",
      detail:
        data?.detail ||
        data?.message ||
        data?.error?.message ||
        "NVIDIA NIM returned an error.",
    });
  }

  // ------------------------------------------------------------
  // EXTRACT ASSISTANT RESPONSE
  // ------------------------------------------------------------

  const content =
    data?.choices?.[0]?.message?.content ??
    "";

  if (!content) {
    console.error(
      "VANT received an empty model response:",
      JSON.stringify(data)
    );

    return res.status(502).json({
      error: "empty_model_response",
      message: "The model returned no usable content.",
    });
  }

  // ------------------------------------------------------------
  // RETURN RESPONSE TO VANT FRONTEND
  // ------------------------------------------------------------

  return res.status(200).json({
    content: [
      {
        type: "text",
        text: content,
      },
    ],

    model: "google/gemma-4-31b-it",
  });
}
