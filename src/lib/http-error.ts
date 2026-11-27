/**
 * An error with an HTTP status and a stable `code` clients can switch on.
 * Throw it anywhere; the error middleware turns it into the standard JSON shape.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
