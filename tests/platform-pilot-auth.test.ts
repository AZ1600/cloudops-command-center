import {
  afterEach,
  describe,
  expect,
  it
} from "vitest";
import { authenticatePlatformPilotRequest } from "@/lib/platform-pilot-auth";

const originalToken =
  process.env.PLATFORM_PILOT_INGEST_TOKEN;

const endpoint =
  "http://localhost/api/platform-pilot/findings";

function createRequest(authorization?: string) {
  const headers = new Headers();

  if (authorization) {
    headers.set("Authorization", authorization);
  }

  return new Request(endpoint, {
    method: "POST",
    headers
  });
}

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.PLATFORM_PILOT_INGEST_TOKEN;
    return;
  }

  process.env.PLATFORM_PILOT_INGEST_TOKEN =
    originalToken;
});

describe("PlatformPilot service authentication", () => {
  it("returns 503 when the server token is not configured", () => {
    delete process.env.PLATFORM_PILOT_INGEST_TOKEN;

    const result = authenticatePlatformPilotRequest(
      createRequest()
    );

    expect(result).toEqual({
      authorized: false,
      status: 503,
      error: "PlatformPilot ingestion is not configured"
    });
  });

  it("returns 401 when the authorization header is missing", () => {
    process.env.PLATFORM_PILOT_INGEST_TOKEN =
      "expected-test-token";

    const result = authenticatePlatformPilotRequest(
      createRequest()
    );

    expect(result).toEqual({
      authorized: false,
      status: 401,
      error: "PlatformPilot authorization failed"
    });
  });

  it("returns 401 when the bearer token is incorrect", () => {
    process.env.PLATFORM_PILOT_INGEST_TOKEN =
      "expected-test-token";

    const result = authenticatePlatformPilotRequest(
      createRequest("Bearer incorrect-test-token")
    );

    expect(result).toEqual({
      authorized: false,
      status: 401,
      error: "PlatformPilot authorization failed"
    });
  });

  it("authorizes the correct bearer token", () => {
    process.env.PLATFORM_PILOT_INGEST_TOKEN =
      "expected-test-token";

    const result = authenticatePlatformPilotRequest(
      createRequest("Bearer expected-test-token")
    );

    expect(result).toEqual({
      authorized: true
    });
  });

  it("accepts a case-insensitive bearer scheme", () => {
    process.env.PLATFORM_PILOT_INGEST_TOKEN =
      "expected-test-token";

    const result = authenticatePlatformPilotRequest(
      createRequest("bEaReR expected-test-token")
    );

    expect(result).toEqual({
      authorized: true
    });
  });
});