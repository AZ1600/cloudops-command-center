import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  attachRequestId,
  emitOperationalEvent,
  getRequestId
} from "@/lib/telemetry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("operational telemetry", () => {
  it("preserves a valid upstream request ID", () => {
    const request = new Request(
      "http://localhost/api/test",
      {
        headers: {
          "x-request-id":
            "platform-pilot-request-123"
        }
      }
    );

    expect(getRequestId(request)).toBe(
      "platform-pilot-request-123"
    );
  });

  it("generates a request ID when one is not supplied", () => {
    const request = new Request(
      "http://localhost/api/test"
    );

    expect(getRequestId(request)).toMatch(
      /^[0-9a-f-]{36}$/
    );
  });

  it("rejects malformed upstream request IDs", () => {
    const request = new Request(
      "http://localhost/api/test",
      {
        headers: {
          "x-request-id":
            "invalid request id value"
        }
      }
    );

    const requestId = getRequestId(request);

    expect(requestId).not.toContain(
      "invalid request"
    );

    expect(requestId).toMatch(
      /^[0-9a-f-]{36}$/
    );
  });

  it("adds the request ID to the response", () => {
    const response = new Response(null);

    attachRequestId(
      response,
      "cloudops-request-001"
    );

    expect(
      response.headers.get("x-request-id")
    ).toBe("cloudops-request-001");
  });

  it("emits structured JSON operational events", () => {
    const log = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    emitOperationalEvent("warn", {
      event: "risk.execution.blocked",
      requestId: "cloudops-request-001",
      route: "/api/risks/[riskId]",
      outcome: "blocked",
      statusCode: 409,
      riskId: "risk-001",
      requestedStatus: "executed",
      currentStatus: "needs_approval",
      actorRole: "owner",
      reason: "approval_required"
    });

    expect(log).toHaveBeenCalledTimes(1);

    const record = JSON.parse(
      log.mock.calls[0][0] as string
    );

    expect(record).toMatchObject({
      level: "warn",
      service: "cloudops-command-center",
      event: "risk.execution.blocked",
      requestId: "cloudops-request-001",
      outcome: "blocked",
      statusCode: 409,
      reason: "approval_required"
    });

    expect(record.timestamp).toEqual(
      expect.any(String)
    );
  });
});
