export class WorkspaceAccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}
