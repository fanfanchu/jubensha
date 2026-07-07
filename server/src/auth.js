import { createHmac, timingSafeEqual } from "node:crypto";

const tokenTtlSeconds = 7 * 24 * 60 * 60;

export function createAuthHandlers(database) {
  return {
    login(request, response) {
      const password = String(request.body?.password ?? "");
      const role = resolveRole(database, password);

      if (!role) {
        response.status(401).json({
          error: "INVALID_PASSWORD",
          message: "密码错误",
        });
        return;
      }

      response.json({
        role,
        token: signToken({ role }),
      });
    },

    me(request, response) {
      response.json({
        role: request.auth.role,
      });
    },
  };
}

export function authenticate(request, response, next) {
  const authorization = request.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    response.status(401).json({
      error: "UNAUTHORIZED",
      message: "请先登录",
    });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    response.status(401).json({
      error: "INVALID_TOKEN",
      message: "登录状态已失效，请重新登录",
    });
    return;
  }

  request.auth = payload;
  next();
}

export function requireAdmin(request, response, next) {
  if (request.auth?.role !== "admin") {
    response.status(403).json({
      error: "FORBIDDEN",
      message: "当前权限不可操作",
    });
    return;
  }

  next();
}

function resolveRole(database, password) {
  const settings = database
    .prepare(
      `
      SELECT key, value
      FROM settings
      WHERE key IN ('admin_password', 'viewer_password')
      `,
    )
    .all();

  const adminPassword = settings.find((item) => item.key === "admin_password")?.value;
  const viewerPassword = settings.find((item) => item.key === "viewer_password")?.value;

  if (adminPassword && safeEqual(password, adminPassword)) {
    return "admin";
  }

  if (viewerPassword && safeEqual(password, viewerPassword)) {
    return "viewer";
  }

  return null;
}

function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + tokenTtlSeconds,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(body));
  const signature = createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  if (!safeEqual(signature, createSignature(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (!["admin", "viewer"].includes(payload.role) || payload.exp < now) {
      return null;
    }

    return {
      role: payload.role,
    };
  } catch {
    return null;
  }
}

function createSignature(value) {
  return createHmac("sha256", getTokenSecret()).update(value).digest("base64url");
}

function getTokenSecret() {
  return process.env.AUTH_TOKEN_SECRET ?? "development-auth-token-secret";
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
