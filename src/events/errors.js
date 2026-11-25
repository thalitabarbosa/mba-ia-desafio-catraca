export class ValidationError extends Error {
  constructor(messages) { super(messages.join(' ')); this.messages = messages; }
}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
