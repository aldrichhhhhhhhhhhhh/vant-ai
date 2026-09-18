// Vercel serverless function.
// NVIDIA API key stays server-side and never reaches the browser.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "missing_api_key" });
    return;
  }

  const { system, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "missing_messages" });
    return;
  }

  const nimMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  try {
    const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
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
          chat_template_kwargs: { enable_thinking: false },
        },
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: "nvidia_api_error",
        detail: data?.detail || data?.message || data?.error || "NVIDIA NIM request failed",
      });
      return;
    }

    const text = data?.choices?.[0]?.message?.content || "";

    // Keep the response shape expected by the existing VANT frontend.
    res.status(200).json({
      content: [{ type: "text", text }],
      model: data?.model,
      usage: data?.usage,
    });
  } catch (err) {
    console.error("NVIDIA NIM request failed:", err);
    res.status(502).json({ error: "upstream_request_failed" });
  }
}
