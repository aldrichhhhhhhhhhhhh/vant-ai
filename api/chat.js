// VANT → NVIDIA NIM
// Vercel serverless function
// NVIDIA API key remains server-side.

export default async function handler(req, res) {
  // -----------------------------------------
  // METHOD
  // -----------------------------------------
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Only POST requests are allowed.",
    });
  }

  // -----------------------------------------
  // API KEY
  // -----------------------------------------
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    console.error("NVIDIA_API_KEY is missing.");

    return res.status(500).json({
      error: "missing_api_key",
      message: "NVIDIA_API_KEY is not configured.",
    });
  }

  // -----------------------------------------
  // REQUEST BODY
  // -----------------------------------------
  const { system, messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "missing_messages",
      message: "No messages were provided.",
    });
  }

  // -----------------------------------------
  // BUILD MESSAGES
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
  // NVIDIA REQUEST
  // -----------------------------------------
  try {
    const response = await fetch(
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

          temperature: 1.0,
          top_p: 0.95,

          max_tokens: 2048,

          stream: false,
        }),
      }
    );

    // -----------------------------------------
    // READ RESPONSE
    // -----------------------------------------
    const raw = await response.text();

    let data;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        raw,
      };
    }

    // -----------------------------------------
    // NVIDIA ERROR
    // -----------------------------------------
    if (!response.ok) {
      console.error("NVIDIA NIM ERROR:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      let detail = "NVIDIA request failed.";

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
    // EXTRACT MODEL RESPONSE
    // -----------------------------------------
    const text =
      data?.choices?.[0]?.message?.content || "";

    if (!text) {
      console.error(
        "NVIDIA returned no assistant content:",
        data
      );

      return res.status(502).json({
        error: "empty_nvidia_response",
        message:
          "NVIDIA returned a response, but no assistant text was found.",
      });
    }

    // -----------------------------------------
    // RETURN TO VANT
    // -----------------------------------------
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
    console.error(
      "VANT → NVIDIA connection failed:",
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
