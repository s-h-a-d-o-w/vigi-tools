import { createHash, randomBytes } from "node:crypto";

export type DigestChallenge = {
  realm: string;
  nonce: string;
  algorithm: string;
  qop?: string;
  opaque?: string;
};

/** Maps the spelling used by the VIGI spec ("SHA-256") onto node's algorithm names. */
export function digestHash(algorithm: string, value: string): string {
  const normalized = algorithm.toLowerCase().replaceAll("-", "");
  return createHash(normalized === "" ? "md5" : normalized)
    .update(value)
    .digest("hex");
}

export function parseWwwAuthenticate(header: string): DigestChallenge {
  const scheme = header.trimStart().split(/\s+/u)[0] ?? "";
  if (scheme.toLowerCase() !== "digest") {
    throw new Error(`Unsupported authentication scheme: ${scheme}`);
  }

  const parameters = new Map<string, string>();
  const pattern = /(?<key>\w+)\s*=\s*(?:"(?<quoted>[^"]*)"|(?<bare>[^,\s]+))/gu;
  for (const { groups } of header.matchAll(pattern)) {
    const key = groups?.["key"];
    if (key !== undefined) {
      parameters.set(
        key.toLowerCase(),
        groups?.["quoted"] ?? groups?.["bare"] ?? "",
      );
    }
  }

  const realm = parameters.get("realm");
  const nonce = parameters.get("nonce");
  if (realm === undefined || nonce === undefined) {
    throw new Error(`Digest challenge is missing realm or nonce: ${header}`);
  }

  return {
    realm,
    nonce,
    algorithm: parameters.get("algorithm") ?? "MD5",
    qop: parameters.get("qop"),
    opaque: parameters.get("opaque"),
  };
}

export function buildAuthorization(options: {
  challenge: DigestChallenge;
  username: string;
  password: string;
  method: string;
  uri: string;
}): string {
  const { challenge, username, password, method, uri } = options;
  const { algorithm, realm, nonce } = challenge;

  const ha1 = digestHash(algorithm, `${username}:${realm}:${password}`);
  const ha2 = digestHash(algorithm, `${method}:${uri}`);
  const qop = challenge.qop?.split(",")[0]?.trim();

  const fields = new Map<string, string>([
    ["username", username],
    ["realm", realm],
    ["nonce", nonce],
    ["uri", uri],
    ["algorithm", algorithm],
  ]);

  let response: string;
  if (qop === undefined || qop === "") {
    response = digestHash(algorithm, `${ha1}:${nonce}:${ha2}`);
  } else {
    const cnonce = randomBytes(8).toString("hex");
    const nonceCount = "00000001";
    response = digestHash(
      algorithm,
      `${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`,
    );
    fields.set("qop", qop);
    fields.set("nc", nonceCount);
    fields.set("cnonce", cnonce);
  }

  fields.set("response", response);
  if (challenge.opaque !== undefined) {
    fields.set("opaque", challenge.opaque);
  }

  // RFC 7616 sends `algorithm`, `qop` and `nc` unquoted, but the camera's RTSP
  // parser only recognises quoted values and answers 401 otherwise.
  const serialized = [...fields].map(([key, value]) => `${key}="${value}"`);

  return `Digest ${serialized.join(", ")}`;
}
