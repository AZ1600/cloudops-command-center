type OperationalLevel = "info" | "warn" | "error";

type OperationalOutcome =
  | "accepted"
  | "rejected"
  | "blocked"
  | "completed";

export type OperationalEvent = {
  event: string;
  requestId: string;
  route: string;
  outcome: OperationalOutcome;
  statusCode: number;
  riskId?: string;
  findingId?: string;
  requestedStatus?: string;
  currentStatus?: string;
  actorRole?: string;
  reason?: string;
};

const requestIdPattern =
  /^[A-Za-z0-9._:-]{1,128}$/;

export function getRequestId(request: Request) {
  const supplied =
    request.headers.get("x-request-id")?.trim();

  if (
    supplied &&
    requestIdPattern.test(supplied)
  ) {
    return supplied;
  }

  return crypto.randomUUID();
}

export function attachRequestId<T extends Response>(
  response: T,
  requestId: string
): T {
  response.headers.set("x-request-id", requestId);
  return response;
}

export function emitOperationalEvent(
  level: OperationalLevel,
  event: OperationalEvent
) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "cloudops-command-center",
    ...event
  });

  if (level === "error") {
    console.error(record);
    return;
  }

  if (level === "warn") {
    console.warn(record);
    return;
  }

  console.info(record);
}
