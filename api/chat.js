export const config = {
  maxDuration: 60,
};

import { createClient } from "@supabase/supabase-js";
import { completeVant, streamVant } from "./_vant-engine.js";

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
     UNIFIED GPT-OSS ENGINE
     --------------------------------------------------------- */

  const engineMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...validMessages,
  ];

  const hasExplicitMaxTokens =
    max_tokens !== null &&
    max_tokens !== undefined &&
    max_tokens !== "" &&
    Number.isFinite(Number(max_tokens));

  const requestedMaxTokens = hasExplicitMaxTokens
    ? Math.max(64, Math.min(8192, Number(max_tokens)))
    : hasImage
      ? 900
      : 8192;

  const engineOptions = {
    temperature: 0.6,
    top_p: 0.7,
    max_tokens: requestedMaxTokens,
    reasoning_effort: "low",
  };

  if (stream) {
    return streamVant(apiKey, engineMessages, res, engineOptions);
  }

  try {
    const result = await completeVant(apiKey, engineMessages, engineOptions);
    return json(res, 200, {
      content: [{ type: "text", text: result.text }],
      model: result.model,
      engine: "gpt-oss",
      finish_reason: result.finish_reason,
      completion_passes: result.completion_passes,
      usage: result.usage,
    });
  } catch (error) {
    console.error("VANT unified completion error:", error);
    const incomplete = error?.code === "response_incomplete";
    return json(res, incomplete ? 502 : error?.status || 502, {
      error: incomplete ? "vant_response_incomplete" : "vant_model_unavailable",
      detail: error?.message || "The model could not complete the request.",
    });
  }
}
