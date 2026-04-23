// Shared Anthropic API config + request helper for api/* handlers.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": process.env.ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "pdfs-2024-09-25,prompt-caching-2024-07-31",
};
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL       || "claude-sonnet-4-6";
const HEAVY_MODEL   = process.env.ANTHROPIC_MODEL_HEAVY || "claude-opus-4-7";

// Wraps the system prompt with ephemeral cache_control and normalises usage fields.
// Throws Error with { status, detail } on non-2xx so callers can build their own error responses.
async function postMessages({ model = DEFAULT_MODEL, maxTokens = 4096, system, messages }) {
  // Guard: Anthropic rejects empty text content blocks with a cryptic 400.
  if (!system) throw new Error("postMessages: system prompt is empty or missing");
  if (!messages?.length) throw new Error("postMessages: messages array is empty");
  for (const msg of messages) {
    const content = msg.content;
    if (typeof content === "string" && content === "") throw new Error("postMessages: message content is empty string");
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && !block.text) throw new Error(`postMessages: text block in ${msg.role} message has empty text`);
      }
    }
  }

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw Object.assign(new Error(`Anthropic ${resp.status}`), { status: resp.status, detail });
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  return {
    text,
    stopReason: data.stop_reason,
    model: data.model,
    usage: {
      inputTokens:          data.usage?.input_tokens                || 0,
      outputTokens:         data.usage?.output_tokens               || 0,
      cacheReadTokens:      data.usage?.cache_read_input_tokens     || 0,
      cacheCreationTokens:  data.usage?.cache_creation_input_tokens || 0,
    },
  };
}

module.exports = { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL, HEAVY_MODEL, postMessages };
