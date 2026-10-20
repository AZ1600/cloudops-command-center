export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim(),
  );
}

export function isLocalDemoAllowed() {
  return process.env.NODE_ENV !== "production" &&
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    !process.env.CLERK_SECRET_KEY?.trim();
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
}
