import {
  createHash,
  timingSafeEqual
} from "node:crypto";

export type PlatformPilotAuthenticationResult =
  | {
      authorized: true;
    }
  | {
      authorized: false;
      status: 401 | 503;
      error: string;
    };

export function authenticatePlatformPilotRequest(
  request: Request
): PlatformPilotAuthenticationResult {
  const expectedToken =
    process.env.PLATFORM_PILOT_INGEST_TOKEN;

  if (!expectedToken) {
    return {
      authorized: false,
      status: 503,
      error: "PlatformPilot ingestion is not configured"
    };
  }

  const authorizationHeader =
    request.headers.get("authorization");

  const bearerMatch =
    authorizationHeader?.match(/^Bearer\s+(.+)$/i);

  if (!bearerMatch) {
    return {
      authorized: false,
      status: 401,
      error: "PlatformPilot authorization failed"
    };
  }

  const suppliedToken = bearerMatch[1];

  if (!tokensMatch(expectedToken, suppliedToken)) {
    return {
      authorized: false,
      status: 401,
      error: "PlatformPilot authorization failed"
    };
  }

  return {
    authorized: true
  };
}

function tokensMatch(
  expectedToken: string,
  suppliedToken: string
): boolean {
  const expectedDigest = createHash("sha256")
    .update(expectedToken)
    .digest();

  const suppliedDigest = createHash("sha256")
    .update(suppliedToken)
    .digest();

  return timingSafeEqual(
    expectedDigest,
    suppliedDigest
  );
}