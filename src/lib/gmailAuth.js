// gmailAuth.js — detect expired Gmail provider_token responses from API handlers.

export function isGmailAuthError(resp, body) {
  if (!resp) return false;
  if (resp.status === 402) return true;
  if (body && body.error === "gmail_token_expired") return true;
  return false;
}
