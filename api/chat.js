// VANT → NVIDIA NIM
// Vercel serverless function
// NVIDIA API key remains server-side.

export default async function handler(req, res) {
  // -----------------------------------------
  // 1. METHOD
  // -----------------------------------------
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Only POST requests are allowed.",
    });
  }

  // -----------------------------------------
  // 2. NVIDIA API KEY
  // -----------------------------------------
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    console.error("VANT ERROR: NVIDIA_API_KEY is missing.");

    return res.status(500).json({
      error: "missing_api_key",
      message: "NVIDIA_API_KEY is not configured.",
    });
  }

  // -----------------------------------------
  // 2b. ACCESS CODE
  // Fails CLOSED: if no code is configured on the
  // server, nobody gets through until you set one.
  // -----------------------------------------
  const requiredCode = process.env.APP_ACCESS_CODE;

  if (!requiredCode) {
    console.error("VANT ERROR: APP_ACCESS_CODE is not configured.");

    return res.status(500).json({
      error: "access_not_configured",
      message: "APP_ACCESS_CODE is not configured on the server.",
    });
  }

  const providedCode = req.headers["x-access-code"];

  if (providedCode !== requiredCode) {
    console.warn("VANT: rejected request with invalid access code.");

    return res.status(401).json({
      error: "invalid_access_code",
      message: "Missing or incorrect access code.",
    });
  }

  // -----------------------------------------
  // 3. REQUEST BODY
  // -----------------------------------------
  const { system, messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "missing_messages",
      message: "No chat messages were provided.",
    });
  }

  // -----------------------------------------
  // 3b. PAYLOAD SIZE GUARD
  // Blunt but effective: caps the total characters
  // sent per request, regardless of source (chat
  // message, uploaded CSV, planner goal, etc).
  // -----------------------------------------
  const MAX_CHARS = 20000;
  const totalChars = (system || "").length + JSON.stringify(messages).length;

  if (totalChars > MAX_CHARS) {
    console.warn(`VANT: rejected oversized request (${totalChars} chars).`);

    return res.status(413).json({
      error: "payload_too_large",
      message: `Request too large (${totalChars} characters, limit ${MAX_CHARS}).`,
    });
  }

  // -----------------------------------------
  // 4. BUILD MESSAGE ARRAY
  // -----------------------------------------
  const nimMessages = system
    ? [
        {
          role: "system",
          content: system,
        },
        ...messages,
      ]
    : messages;

  // -----------------------------------------
  // 5. NVIDIA REQUEST WITH TIMEOUT
  // -----------------------------------------
  const controller = new AbortController();

  // Give NVIDIA 15 seconds.
  // This is intentionally shorter than VANT's
  // 20-second browser timeout.
  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    console.log("VANT: Sending request to NVIDIA NIM...");

    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: "nvidia/nemotron-3.5-lightning-30b-a3b",

          messages: nimMessages,

          temperature: 0.4,
          top_p: 0.95,

          // Keep this small for our first test.
          max_tokens: 256,

          stream: false,

          // IMPORTANT:
          // For raw fetch(), this goes directly
          // in the request body.
          chat_template_kwargs: {
            enable_thinking: false,
          },
        }),
      }
    );

    clearTimeout(timeout);

    console.log(
      `VANT: NVIDIA responded with HTTP ${response.status}`
    );

    // -----------------------------------------
    // 6. READ NVIDIA RESPONSE
    // -----------------------------------------
    const raw = await response.text();

    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        raw,
      };
    }

    // -----------------------------------------
    // 7. NVIDIA ERROR
    // -----------------------------------------
    if (!response.ok) {
      console.error("VANT: NVIDIA API ERROR", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      let detail = "NVIDIA NIM request failed.";

      if (typeof data === "string") {
        detail = data;
      } else if (typeof data?.message === "string") {
        detail = data.message;
      } else if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (typeof data?.error === "string") {
        detail = data.error;
      } else if (data?.error) {
        detail = JSON.stringify(data.error);
      } else if (data?.detail) {
        detail = JSON.stringify(data.detail);
      } else if (data?.raw) {
        detail = data.raw;
      }

      return res.status(response.status).json({
        error: "nvidia_api_error",
        message: detail,
        status: response.status,
      });
    }

    // -----------------------------------------
    // 8. EXTRACT RESPONSE
    // -----------------------------------------
    const text =
      data?.choices?.[0]?.message?.content || "";

    if (!text) {
      console.error(
        "VANT: NVIDIA returned no assistant content.",
        data
      );

      return res.status(502).json({
        error: "empty_nvidia_response",
        message:
          "NVIDIA returned a response but no assistant text.",
      });
    }

    // -----------------------------------------
    // 9. RETURN TO VANT
    // -----------------------------------------
    console.log("VANT: NVIDIA response received successfully.");

    return res.status(200).json({
      content: [
        {
          type: "text",
          text,
        },
      ],

      model: data?.model,

      usage: data?.usage,
    });

  } catch (error) {
    clearTimeout(timeout);

    // -----------------------------------------
    // 10. NVIDIA TIMEOUT
    // -----------------------------------------
    if (error?.name === "AbortError") {
      console.error(
        "VANT: NVIDIA request timed out after 15 seconds."
      );

      return res.status(504).json({
        error: "nvidia_timeout",
        message:
          "NVIDIA did not respond within 15 seconds.",
      });
    }

    // -----------------------------------------
    // 11. OTHER CONNECTION ERROR
    // -----------------------------------------
    console.error(
      "VANT: NVIDIA connection failed:",
      error
    );

    return res.status(502).json({
      error: "upstream_request_failed",
      message:
        error?.message ||
        "Unable to connect to NVIDIA NIM.",
    });
  }
}
