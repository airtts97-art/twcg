export const firebaseConfig = {
  apiKey: "AIzaSyBRRUttf5Fm-ijDsnSFf3gvZYPpi8cmrIE",
  authDomain: "threadscard-68f82.firebaseapp.com",
  projectId: "threadscard-68f82",
  storageBucket: "threadscard-68f82.firebasestorage.app",
  messagingSenderId: "88156430574",
  appId: "1:88156430574:web:4d91c8b66e7c7d1948d3ff",
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

function buildFirestoreListUrl(collection, { pageSize, pageToken } = {}) {
  const params = new URLSearchParams();
  params.set("key", firebaseConfig.apiKey);
  if (pageSize) params.set("pageSize", String(pageSize));
  if (pageToken) params.set("pageToken", pageToken);
  return `${FIRESTORE_BASE}/${collection}?${params.toString()}`;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Default cards per Firestore list page. */
export const FIRESTORE_DEFAULT_PAGE_SIZE = 100;

/** Smallest page size after repeated 429 halving. */
export const FIRESTORE_MIN_PAGE_SIZE = 5;

/** Minimum spacing between consecutive Firestore REST requests. */
export const FIRESTORE_MIN_REQUEST_INTERVAL_MS = 1500;

/** Extra pause between paginated list requests (in addition to the limiter). */
export const FIRESTORE_PAGE_DELAY_MS = 800;

/** Wait before the first request in a fetch session (avoids hammering after reload). */
export const FIRESTORE_INITIAL_DELAY_MS = 1200;

export class FirestoreFetchError extends Error {
  constructor(message, { status, pageIndex, pageSize, cardsCollected = 0 } = {}) {
    super(message);
    this.name = "FirestoreFetchError";
    this.status = status;
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.cardsCollected = cardsCollected;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(maxMs = 400) {
  return Math.floor(Math.random() * maxMs);
}

class FirestoreRequestLimiter {
  constructor({ minIntervalMs = FIRESTORE_MIN_REQUEST_INTERVAL_MS } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.lastRequestAt = 0;
    this.chain = Promise.resolve();
  }

  schedule(fn) {
    const run = this.chain.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.minIntervalMs - (now - this.lastRequestAt));
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      return fn();
    });
    this.chain = run.catch(() => {});
    return run;
  }
}

const firestoreLimiter = new FirestoreRequestLimiter();

function retryWaitMs(status, attempt, response) {
  const retryAfterHeader = Number(response?.headers?.get?.("Retry-After"));
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
    return retryAfterHeader * 1000 + jitterMs(500);
  }
  if (status === 429) {
    return Math.min(120000, 5000 * 2 ** (attempt - 1)) + jitterMs(1200);
  }
  return Math.min(30000, 1000 * 2 ** (attempt - 1)) + jitterMs(400);
}

async function fetchFirestoreJson(
  url,
  { signal, maxRetries = 4, throwOn429 = false, pageIndex, pageSize, cardsCollected = 0 } = {},
) {
  return firestoreLimiter.schedule(async () => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      const response = await fetch(url, { signal });
      if (response.ok) return response.json();
      if (response.status === 429 && throwOn429) {
        throw new FirestoreFetchError("Firestore cards fetch failed (429)", {
          status: 429,
          pageIndex,
          pageSize,
          cardsCollected,
        });
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
        await sleep(retryWaitMs(response.status, attempt, response));
        continue;
      }
      throw new FirestoreFetchError(`Firestore cards fetch failed (${response.status})`, {
        status: response.status,
        pageIndex,
        pageSize,
        cardsCollected,
      });
    }
  });
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

async function fetchAllPagesAtPageSize(pageSize, {
  signal,
  pageDelayMs = FIRESTORE_PAGE_DELAY_MS,
} = {}) {
  const cards = [];
  let pageToken = "";
  let pageIndex = 0;
  do {
    if (pageIndex > 0 && pageDelayMs > 0) await sleep(pageDelayMs);
    pageIndex += 1;
    const url = buildFirestoreListUrl("cards", { pageSize, pageToken: pageToken || undefined });
    const payload = await fetchFirestoreJson(url, {
      signal,
      throwOn429: true,
      pageIndex,
      pageSize,
      cardsCollected: cards.length,
    });
    for (const doc of payload.documents || []) {
      const card = firestoreDocToCard(doc);
      if (card?.id && card?.name) cards.push(card);
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return { cards, pagesFetched: pageIndex };
}

export async function fetchAllFirebaseCards({
  pageSize = FIRESTORE_DEFAULT_PAGE_SIZE,
  signal,
  pageDelayMs = FIRESTORE_PAGE_DELAY_MS,
  minRequestIntervalMs = FIRESTORE_MIN_REQUEST_INTERVAL_MS,
  initialDelayMs = FIRESTORE_INITIAL_DELAY_MS,
} = {}) {
  if (minRequestIntervalMs !== firestoreLimiter.minIntervalMs) {
    firestoreLimiter.minIntervalMs = minRequestIntervalMs;
  }
  if (initialDelayMs > 0) await sleep(initialDelayMs);

  let currentPageSize = Math.max(FIRESTORE_MIN_PAGE_SIZE, Math.floor(Number(pageSize) || FIRESTORE_DEFAULT_PAGE_SIZE));
  const rateLimitEvents = [];

  while (currentPageSize >= FIRESTORE_MIN_PAGE_SIZE) {
    try {
      const { cards, pagesFetched } = await fetchAllPagesAtPageSize(currentPageSize, { signal, pageDelayMs });
      const fetchMeta = {
        finalPageSize: currentPageSize,
        pagesFetched,
        rateLimitEvents,
        totalCards: cards.length,
      };
      if (rateLimitEvents.length) {
        console.info("[fetchAllFirebaseCards] completed after 429 recovery:", fetchMeta);
      }
      return Object.assign(cards, { fetchMeta });
    } catch (error) {
      if (!(error instanceof FirestoreFetchError) || error.status !== 429) throw error;

      const nextPageSize = Math.max(FIRESTORE_MIN_PAGE_SIZE, Math.floor(currentPageSize / 2));
      const event = {
        stuckAtPage: error.pageIndex,
        pageSize: currentPageSize,
        nextPageSize,
        cardsCollectedBeforeRetry: error.cardsCollected,
      };
      rateLimitEvents.push(event);
      console.warn(
        `[fetchAllFirebaseCards] 429 at page ${error.pageIndex} `
        + `(pageSize=${currentPageSize}, collected=${error.cardsCollected}). `
        + `Restart with pageSize=${nextPageSize}.`,
      );

      if (nextPageSize >= currentPageSize) {
        error.fetchMeta = { finalPageSize: currentPageSize, rateLimitEvents, failed: true };
        throw error;
      }

      currentPageSize = nextPageSize;
      await sleep(retryWaitMs(429, rateLimitEvents.length, null));
    }
  }

  throw new Error("Firestore cards fetch failed: pageSize exhausted after 429");
}
