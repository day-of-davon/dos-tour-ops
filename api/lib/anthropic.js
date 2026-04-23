// Shared Anthropic API config — imported by all api/* handlers.
// Change once here; all callers pick it up.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": process.env.ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "pdfs-2024-09-25,prompt-caching-2024-07-31",
};
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL       || "claude-sonnet-4-6";
const HEAVY_MODEL   = process.env.ANTHROPIC_MODEL_HEAVY || "claude-opus-4-7";

module.exports = { ANTHROPIC_URL, ANTHROPIC_HEADERS, DEFAULT_MODEL, HEAVY_MODEL };
