import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { firebaseConfig } from "../src/firebase_cards.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

function jsToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) {
      fields[key] = jsToFirestoreValue(nested);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function cardToFirestoreFields(card) {
  const fields = {};
  for (const [key, value] of Object.entries(card)) {
    fields[key] = jsToFirestoreValue(value);
  }
  return fields;
}

async function loadLocalEnv() {
  const env = {};
  try {
    const raw = await readFile(join(root, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = value;
    }
  } catch {
    // optional
  }
  return env;
}

async function tokenFromServiceAccount(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).toString("base64url");
  const signInput = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signInput);
  sign.end();
  const signature = sign.sign(serviceAccount.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signInput}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Service account token exchange failed (${response.status})`);
  }
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Service account token response missing access_token");
  return payload.access_token;
}

async function resolveAccessToken(env) {
  const direct = process.env.FIREBASE_ACCESS_TOKEN || env.FIREBASE_ACCESS_TOKEN;
  if (direct) return direct;

  try {
    const { execFileSync } = await import("node:child_process");
    const token = execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (token) return token;
  } catch {
    // gcloud not available
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath) {
    const serviceAccount = JSON.parse(await readFile(credentialsPath, "utf8"));
    return tokenFromServiceAccount(serviceAccount);
  }

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    return tokenFromServiceAccount(JSON.parse(inline));
  }

  throw new Error(
    "Firebase upload credentials missing. Set FIREBASE_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS in .env.local",
  );
}

async function upsertCard(token, card) {
  const id = card.id;
  if (!id) throw new Error("card missing id");
  const fields = cardToFirestoreFields(card);
  const fieldPaths = Object.keys(card);
  const documentUrl = `${FIRESTORE_BASE}/cards/${encodeURIComponent(id)}`;
  const patchUrl = `${documentUrl}?${fieldPaths.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`;

  let response = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (response.status === 404) {
    response = await fetch(`${FIRESTORE_BASE}/cards?documentId=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload ${id} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response.json();
}

async function main() {
  const env = await loadLocalEnv();
  const token = await resolveAccessToken(env);
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["card_1782600000000", "card_1782610000000"];

  for (const id of ids) {
    const cardPath = join(root, "deckmaker_cards", `${id}.json`);
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    await upsertCard(token, card);
    console.log(`uploaded: ${id} (${card.name})`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
