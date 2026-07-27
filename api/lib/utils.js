// api/lib/utils.js — small shared helpers for serverless handlers.

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`gmail_timeout_${ms}ms`)), ms)),
  ]);

module.exports = { withTimeout };
