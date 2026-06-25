export const firebaseConfig = {
  apiKey: "AIzaSyBRRUttf5Fm-ijDsnSFf3gvZYPpi8cmrIE",
  authDomain: "threadscard-68f82.firebaseapp.com",
  projectId: "threadscard-68f82",
  storageBucket: "threadscard-68f82.firebasestorage.app",
  messagingSenderId: "88156430574",
  appId: "1:88156430574:web:4d91c8b66e7c7d1948d3ff",
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

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

export async function fetchAllFirebaseCards({ pageSize = 300, signal } = {}) {
  const cards = [];
  let pageToken = "";
  do {
    const url = `${FIRESTORE_BASE}/cards?pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Firestore cards fetch failed (${response.status})`);
    }
    const payload = await response.json();
    for (const doc of payload.documents || []) {
      const card = firestoreDocToCard(doc);
      if (card?.id && card?.name) cards.push(card);
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return cards;
}
