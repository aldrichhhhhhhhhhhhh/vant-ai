export function classifyFinishReason(reason) {
  if (reason === "stop") return "complete";
  if (reason === "length") return "truncated";
  if (reason === "content_filter") return "filtered";
  return "unknown";
}
