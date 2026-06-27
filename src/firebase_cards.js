export const firebaseConfig = {
  apiKey: "AIzaSyBRRUttf5Fm-ijDsnSFf3gvZYPpi8cmrIE",
  authDomain: "threadscard-68f82.firebaseapp.com",
  projectId: "threadscard-68f82",
  storageBucket: "threadscard-68f82.firebasestorage.app",
  messagingSenderId: "88156430574",
  appId: "1:88156430574:web:4d91c8b66e7c7d1948d3ff",
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFirestoreJson(url, { signal, maxRetries = 5 } = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, { signal });
    if (response.ok) return response.json();
    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
      const retryAfterHeader = Number(response.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : Math.min(30000, 1000 * 2 ** (attempt - 1));
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Firestore cards fetch failed (${response.status})`);
  }
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== "object") return value;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) {
    const out = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields || {})) {
      out[key] = firestoreValueToJs(nested);
    }
    return out;
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJs);
  }
  return null;
}

function firestoreDocToCard(doc) {
  const card = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    card[key] = firestoreValueToJs(value);
  }
  if (!card.id && doc.name) {
    const id = doc.name.split("/").pop();
    if (id) card.id = id;
  }
  return card;
}

export async function fetchAllFirebaseCards({ pageSize = 300, signal, pageDelayMs = 200 } = {}) {
  const cards = [];
  let pageToken = "";
  let pageIndex = 0;
  do {
    if (pageIndex > 0 && pageDelayMs > 0) await sleep(pageDelayMs);
    pageIndex += 1;
    const url = `${FIRESTORE_BASE}/cards?pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const payload = await fetchFirestoreJson(url, { signal });
    for (const doc of payload.documents || []) {
      const card = firestoreDocToCard(doc);
      if (card?.id && card?.name) cards.push(card);
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return cards;
}
