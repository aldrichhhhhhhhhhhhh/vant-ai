export const config = {
  maxDuration: 60,
};

import { createClient } from "@supabase/supabase-js";
import { completeVant } from "./_vant-engine.js";

const MODEL = "openai/gpt-oss-20b";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_REQUEST_CHARS = 4_000_000;
const MAX_MESSAGES = 40;
const NVIDIA_TIMEOUT_MS = 45_000;
// Deep-work output budget for professional project answers.
const MAX_OUTPUT_TOKENS = 8192;

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

  // Use the same provider, completion, continuation, and timeout engine as Chat.
  const baseMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages,
  ];

  try {
    const result = await completeVant(apiKey, baseMessages, {
      temperature: 0.6,
      top_p: 0.7,
      max_tokens: MAX_OUTPUT_TOKENS,
      reasoning_effort: "low",
    });

    return json(res, 200, {
      content: [{ type: "text", text: result.text }],
      model: result.model,
      engine: "gpt-oss",
      reasoning_effort: "low",
      finish_reason: result.finish_reason,
      completion_passes: result.completion_passes,
      usage: result.usage,
    });
  } catch (error) {
    console.error("VANT shared engine error:", error);
    const incomplete = error?.code === "response_incomplete";
    return json(res, incomplete ? 502 : error?.status || 502, {
      error: incomplete ? "vant_response_incomplete" : "vant_model_unavailable",
      detail: error?.message || "The model could not complete the request.",
    });
  }
}
