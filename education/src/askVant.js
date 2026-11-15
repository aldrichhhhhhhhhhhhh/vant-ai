export default async function askVant(
  systemPrompt,
  messages,
  timeoutMs = 48000,
  externalSignal = null
) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let accessToken = "";

  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token || "";
  } catch {
    /* auth session may be unavailable */
  }

  if (!accessToken) {
    clearTimeout(timer);
    return "Your VANT session has expired. Please log in again.";
  }

  try {
    const response = await fetch("/api/vant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let data = {};
      try {
        data = await response.json();
      } catch {
        /* ignore invalid error JSON */
      }

      clearTimeout(timer);

      if (data?.error === "missing_api_key") {
        return "The server isn't configured with an NVIDIA API key yet — set NVIDIA_API_KEY in your deployment's environment variables.";
      }

      if (data?.error === "vant_model_timeout") {
        return "VANT's GPT-OSS engine timed out. Try the request again with a shorter message.";
      }

      if (data?.error === "vant_model_unavailable") {
        return "VANT's GPT-OSS engine is temporarily unavailable. Please try again in a moment.";
      }

      if (data?.error === "vant_model_empty") {
        return "VANT's GPT-OSS engine returned no answer. Please try again.";
      }

      const safeDetail =
        typeof data?.detail === "string" && data.detail.trim()
          ? data.detail.trim()
          : typeof data?.error === "string" && data.error.trim()
            ? data.error.trim()
            : "Unknown server error.";

      return `GPT-OSS engine error (HTTP ${response.status}): ${safeDetail}`;
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      clearTimeout(timer);
      return "VANT's GPT-OSS engine returned an invalid response.";
    }

    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);

    const text =
      typeof data?.content?.[0]?.text === "string"
        ? data.content[0].text
        : typeof data?.choices?.[0]?.message?.content === "string"
          ? data.choices[0].message.content
          : "";

    return text.trim() || "VANT's GPT-OSS engine returned no answer.";
  } catch (err) {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);

    if (err?.name === "AbortError") {
      if (externalSignal?.aborted) return "__VANT_USER_STOPPED__";
      return "VANT's GPT-OSS engine timed out. Try a shorter request.";
    }

    console.error("VANT GPT-OSS request error:", err);
    return "VANT's GPT-OSS engine could not reach the model service.";
  }
}


