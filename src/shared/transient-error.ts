/**
 * A failure that says nothing about whether our credentials or request were
 * accepted: the connection broke before an answer came back. Loops may retry
 * these, unlike errors the device deliberately returned.
 */
export class TransientError extends Error {
  override name = "TransientError";
}
