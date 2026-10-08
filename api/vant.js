export const config = {
  maxDuration: 60,
};

import { createClient } from "@supabase/supabase-js";

const MODEL = "openai/gpt-oss-20b";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_REQUEST_CHARS = 4_000_000;
const MAX_MESSAGES = 40;
const NVIDIA_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 2048;

function json(res, status, body) {
  return res.status(status).json(body);
}

function isValidTextMessage(message) {
  return Boolean(
    message &&
      typeof message === "object" &&
      ["user", "assistant", "system"].includes(message.role) &&
      typeof message.content === "string"
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "method_not_allowed" });
  }

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
    return json(res, 500, { error: "supabase_not_configured" });
  }

  if (!accessToken) {
    return json(res, 401, { error: "authentication_required" });
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

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData?.user) {
    return json(res, 401, { error: "invalid_session" });
  }

  const expectedAccessCode = process.env.APP_ACCESS_CODE;
  const providedAccessCode = req.headers["x-access-code"] || "";

  if (!expectedAccessCode) {
    return json(res, 500, { error: "access_not_configured" });
  }

  if (providedAccessCode !== expectedAccessCode) {
    return json(res, 401, { error: "invalid_access_code" });
  }

  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return json(res, 500, { error: "missing_api_key" });
  }

  const { system, messages } = req.body || {};

  if (system !== undefined && typeof system !== "string") {
    return json(res, 400, { error: "invalid_system_prompt" });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return json(res, 400, { error: "invalid_messages" });
  }

  if (messages.length > MAX_MESSAGES) {
    return json(res, 413, { error: "too_many_messages" });
  }

  if (!messages.every(isValidTextMessage)) {
    return json(res, 400, {
      error: "invalid_message_format",
      detail: "GPT-OSS Team VANT accepts text-only messages.",
    });
  }

  const payload = {
    model: MODEL,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages,
    ],
    temperature: 0.6,
    top_p: 0.7,
    max_tokens: MAX_OUTPUT_TOKENS,
    reasoning_effort: "low",
    stream: false,
  };

  const serialized = JSON.stringify(payload);

  if (serialized.length > MAX_REQUEST_CHARS) {
    return json(res, 413, { error: "payload_too_large" });
  }

  let response;

  try {
    response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: serialized,
      signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      console.error("VANT GPT-OSS timeout");
      return json(res, 504, {
        error: "vant_model_timeout",
        detail: "GPT-OSS did not complete within the dedicated 45-second engine budget.",
      });
    }

    console.error("VANT GPT-OSS connection error:", err);
    return json(res, 502, {
      error: "vant_model_unavailable",
      detail: "Could not connect to the GPT-OSS model service.",
    });
  }

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {
      /* ignore invalid error JSON */
    }

    const detail =
      data?.error?.message ||
      data?.detail ||
      data?.message ||
      `GPT-OSS returned HTTP ${response.status}.`;

    console.error("VANT GPT-OSS API error:", response.status, data);

    return json(
      res,
      response.status >= 400 && response.status < 500
        ? response.status
        : 502,
      {
        error: "vant_model_unavailable",
        detail,
      }
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    return json(res, 502, {
      error: "vant_model_empty",
      detail: "GPT-OSS returned a response that could not be parsed as JSON.",
    });
  }

  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    console.error("VANT empty GPT-OSS response:", data);
    return json(res, 502, {
      error: "vant_model_empty",
      detail: "GPT-OSS returned no visible answer content.",
    });
  }

  return json(res, 200, {
    content: [{ type: "text", text: content }],
    model: MODEL,
    engine: "gpt-oss",
    reasoning_effort: "low",
  });
}
