// ---------------------------------------------------------------------------
// VANT ENGINE V1
// Work Understanding Layer
// ---------------------------------------------------------------------------

const SIGNALS = {
  calculation: [
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
  ],

  technical: [
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
  ],

  analysis: [
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
  ],

  creative: [
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
  ],

  writing: [
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
  ],

  execution: [
    "create",
    "build",
    "make",
    "generate",
    "prepare",
    "organize",
    "update",
    "send",
    "save",
    "upload",
    "download",
    "schedule",
    "check",
    "find",
    "fix",
    "complete",
    "do this",
    "handle this",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textFromContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => part?.type === "text")
    .map((part) => part?.text || "")
    .join(" ");
}

function countMatches(text, signals) {
  return signals.reduce(
    (score, signal) =>
      score + (text.includes(signal) ? 1 : 0),
    0
  );
}

function hasAny(text, signals) {
  return signals.some((signal) => text.includes(signal));
}

// ---------------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------------

function detectTaskType(text, scores, hasAttachments) {
  if (
    hasAttachments &&
    (scores.analysis > 0 || scores.execution > 0)
  ) {
    if (
      hasAny(text, [
        "spreadsheet",
        "excel",
        "csv",
        "attendance",
        "data",
        "sla",
      ])
    ) {
      return "data_analysis";
    }

    if (
      hasAny(text, [
        "image",
        "photo",
        "screenshot",
        "picture",
      ])
    ) {
      return "visual_analysis";
    }

    if (
      hasAny(text, [
        "pdf",
        "document",
        "report",
      ])
    ) {
      return "document_analysis";
    }
  }

  if (scores.calculation > 0) {
    return "calculation";
  }

  if (scores.technical > 0) {
    return "technical";
  }

  if (scores.creative > 0) {
    return "creative";
  }

  if (scores.writing > 0) {
    return "writing";
  }

  if (scores.execution > 0) {
    return "execution";
  }

  if (scores.analysis > 0) {
    return "analysis";
  }

  return "general";
}

// ---------------------------------------------------------------------------
// Work mode
// ---------------------------------------------------------------------------

function detectMode(scores, text) {
  if (scores.execution > 0) {
    return "execute";
  }

  if (scores.analysis > 0) {
    return "analyze";
  }

  if (scores.creative > 0) {
    return "create";
  }

  if (scores.writing > 0) {
    return "create";
  }

  if (scores.technical > 0) {
    return "solve";
  }

  if (scores.calculation > 0) {
    return "answer";
  }

  if (
    /help me think|what should i|should i|which|decide/i.test(
      text
    )
  ) {
    return "decide";
  }

  return "answer";
}

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

function detectComplexity(
  text,
  scores,
  messageCount,
  attachmentCount
) {
  let points = 0;

  if (text.length >= 500) {
    points += 2;
  } else if (text.length >= 180) {
    points += 1;
  }

  if (scores.analysis >= 2) {
    points += 2;
  }

  if (scores.execution >= 1) {
    points += 2;
  }

  if (attachmentCount > 0) {
    points += 1;
  }

  if (attachmentCount > 2) {
    points += 1;
  }

  if (messageCount >= 4) {
    points += 1;
  }

  if (
    /\b(and|then|after|before|also|finally)\b/i.test(
      text
    )
  ) {
    points += 1;
  }

  if (points >= 5) {
    return "complex";
  }

  if (points >= 2) {
    return "moderate";
  }

  return "simple";
}

// ---------------------------------------------------------------------------
// Execution requirements
// ---------------------------------------------------------------------------

function detectRequirements(
  mode,
  taskType,
  complexity,
  text
) {
  const executionLanguage = hasAny(
    text,
    SIGNALS.execution
  );

  const requiresTask =
    complexity === "complex" ||
    mode === "execute" ||
    [
      "data_analysis",
      "document_analysis",
      "visual_analysis",
    ].includes(taskType);

  const requiresTool =
    taskType === "calculation" ||
    taskType === "data_analysis" ||
    taskType === "technical" ||
    taskType === "document_analysis" ||
    executionLanguage;

  const requiresConfirmation =
    /\b(send|delete|remove|publish|submit|purchase|pay|post|share|overwrite)\b/i.test(
      text
    );

  return {
    requiresTask,
    requiresTool,
    requiresConfirmation,
  };
}

// ---------------------------------------------------------------------------
// Response behavior
// ---------------------------------------------------------------------------

function creativityFor(taskType, mode) {
  if (
    taskType === "creative" ||
    mode === "create"
  ) {
    return "high";
  }

  if (taskType === "writing") {
    return "moderate-high";
  }

  if (
    taskType === "analysis" ||
    taskType === "data_analysis"
  ) {
    return "moderate";
  }

  if (
    taskType === "technical" ||
    taskType === "calculation"
  ) {
    return "low";
  }

  return "adaptive";
}

// ---------------------------------------------------------------------------
// MAIN: Build VANT Work Envelope
// ---------------------------------------------------------------------------

export function buildVantWorkEnvelope({
  messages = [],
  attachments = [],
  memoryAvailable = false,
} = {}) {
  const latestUser = [...messages]
    .reverse()
    .find(
      (message) => message?.role === "user"
    );

  const text = textFromContent(
    latestUser?.content
  )
    .trim()
    .toLowerCase();

  const attachmentCount =
    attachments.length;

  const scores = {
    calculation: countMatches(
      text,
      SIGNALS.calculation
    ),

    technical: countMatches(
      text,
      SIGNALS.technical
    ),

    analysis: countMatches(
      text,
      SIGNALS.analysis
    ),

    creative: countMatches(
      text,
      SIGNALS.creative
    ),

    writing: countMatches(
      text,
      SIGNALS.writing
    ),

    execution: countMatches(
      text,
      SIGNALS.execution
    ),
  };

  const taskType = detectTaskType(
    text,
    scores,
    attachmentCount > 0
  );

  const mode = detectMode(
    scores,
    text
  );

  const complexity =
    detectComplexity(
      text,
      scores,
      messages.length,
      attachmentCount
    );

  const execution =
    detectRequirements(
      mode,
      taskType,
      complexity,
      text
    );

  return {
    version: "vant-work-v1",

    objective:
      text ||
      "Continue the conversation and determine the user's intent.",

    mode,

    taskType,

    complexity,

    context: {
      conversation: messages.length > 0,
      attachments: attachmentCount > 0,
      attachmentCount,
      memory: memoryAvailable,
    },

    execution,

    response: {
      style:
        taskType === "creative" ||
        taskType === "writing"
          ? "natural"
          : complexity === "complex"
            ? "structured"
            : "conversational",

      creativity:
        creativityFor(
          taskType,
          mode
        ),
    },
  };
}

// ---------------------------------------------------------------------------
// Adaptive VANT temperature
// ---------------------------------------------------------------------------

export function getVantTemperature(work) {
  if (!work) {
    return 0.6;
  }

  if (work.taskType === "calculation") {
    return 0.2;
  }

  if (work.taskType === "technical") {
    return 0.3;
  }

  if (work.taskType === "data_analysis") {
    return 0.45;
  }

  if (work.taskType === "document_analysis") {
    return 0.45;
  }

  if (work.taskType === "visual_analysis") {
    return 0.3;
  }

  if (work.taskType === "creative") {
    return work.complexity === "complex"
      ? 0.9
      : 0.8;
  }

  if (work.taskType === "writing") {
    return 0.75;
  }

  if (work.mode === "execute") {
    return 0.45;
  }

  if (work.mode === "decide") {
    return 0.5;
  }

  return 0.6;
}

// ---------------------------------------------------------------------------
// VANT system instructions
// ---------------------------------------------------------------------------

export function buildVantSystemPrompt(work) {
  return `
VANT WORK ENGINE

Work mode: ${work.mode}
Task type: ${work.taskType}
Complexity: ${work.complexity}
Response style: ${work.response.style}
Creativity: ${work.response.creativity}

Treat this request as work to accomplish, not merely text to answer.

WORK RULES:

- Understand the objective before responding.
- Use supplied context and attachments when actually available.
- Never invent tool results, file contents, web results, or observations.
- For analysis, distinguish evidence from inference.
- For execution-oriented requests, produce an actionable result and clearly identify anything that still requires a tool, permission, or user confirmation.
- Never claim an external action was completed unless VANT actually performed it.
- Match the requested level of creativity without sacrificing accuracy.
- Keep simple answers simple.
- Use structure when the work is complex.
- Be direct and useful, like a highly capable work colleague.

VANT WORK LOOP:

Understand → Analyze → Decide → Act → Verify → Report.
`;
}
