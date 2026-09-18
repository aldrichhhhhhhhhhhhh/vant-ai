// VANT → NVIDIA NIM
// Vercel serverless function.
// NVIDIA API key stays server-side and never reaches the browser.

export default async function handler(req, res) {
  // --------------------------------------------------
  // 1. Only allow POST
  // --------------------------------------------------
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Only POST requests are allowed.",
    });
  }

  // --------------------------------------------------
  // 2. Check NVIDIA API key
  // --------------------------------------------------
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    console.error("VANT: NVIDIA_API_KEY is missing.");

    return res.status(500).json({
      error: "missing_api_key",
      message: "NVIDIA_API_KEY is not configured on the server.",
    });
  }

  // --------------------------------------------------
  // 3. Read request body
  // --------------------------------------------------
  const { system, messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "missing_messages",
      message: "No chat messages were provided.",
    });
  }

  // --------------------------------------------------
  // 4. Build NVIDIA message list
  // --------------------------------------------------
  const nimMessages = system
    ? [
        {
          role: "system",
          content: system,
        },
        ...messages,
      ]
    : messages;

  // --------------------------------------------------
  // 5. Call NVIDIA NIM
  // --------------------------------------------------
  try {
    const upstream = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: "nvidia/nemotron-3.5-lightning-30b-a3b",

          messages: nimMessages,

          temperature: 0.4,
          top_p: 0.95,
          max_tokens: 4096,

          stream: false,

          extra_body: {
            chat_template_kwargs: {
              enable_thinking: false,
            },
          },
        }),
      }
    );

    // --------------------------------------------------
    // 6. Safely read NVIDIA response
    // --------------------------------------------------
    const rawText = await upstream.text();

    let data;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {
        raw: rawText,
      };
    }

    // --------------------------------------------------
    // 7. Handle NVIDIA errors
    // --------------------------------------------------
    if (!upstream.ok) {
      console.error("VANT → NVIDIA ERROR", {
        status: upstream.status,
        statusText: upstream.statusText,
        response: data,
      });

      let detail = "NVIDIA NIM request failed.";

      if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (typeof data?.message === "string") {
        detail = data.message;
      } else if (typeof data?.error === "string") {
        detail = data.error;
      } else if (data?.error) {
        detail = JSON.stringify(data.error);
      } else if (data?.detail) {
        detail = JSON.stringify(data.detail);
      } else if (data?.raw) {
        detail = data.raw;
      }

      return res.status(upstream.status).json({
        error: "nvidia_api_error",
        message: detail,
        status: upstream.status,
      });
    }

    // --------------------------------------------------
    // 8. Extract assistant response
    // --------------------------------------------------
    const text =
      data?.choices?.[0]?.message?.content ??
      "";

    // --------------------------------------------------
    // 9. Make sure NVIDIA actually returned content
    // --------------------------------------------------
    if (!text) {
      console.error("VANT: NVIDIA returned no assistant content.", data);

      return res.status(502).json({
        error: "empty_nvidia_response",
        message: "NVIDIA returned a successful response but no text content.",
        model: data?.model,
      });
    }

    // --------------------------------------------------
    // 10. Return the format expected by VANT
    // --------------------------------------------------
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
  } catch (err) {
    // --------------------------------------------------
    // 11. Network / fetch / unexpected errors
    // --------------------------------------------------
    console.error("VANT → NVIDIA REQUEST FAILED:", err);

    return res.status(502).json({
      error: "upstream_request_failed",
      message:
        err?.message ||
        "Unable to connect to NVIDIA NIM.",
    });
  }
}
