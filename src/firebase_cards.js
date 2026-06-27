export const firebaseConfig = {
  apiKey: "AIzaSyBRRUttf5Fm-ijDsnSFf3gvZYPpi8cmrIE",
  authDomain: "threadscard-68f82.firebaseapp.com",
  projectId: "threadscard-68f82",
  storageBucket: "threadscard-68f82.firebasestorage.app",
  messagingSenderId: "88156430574",
  appId: "1:88156430574:web:4d91c8b66e7c7d1948d3ff",
};

/** @deprecated REST pagination removed; kept for import compatibility. */
export const FIRESTORE_DEFAULT_PAGE_SIZE = 100;

const FIREBASE_SDK_VERSION = "10.14.1";
const isBrowser = typeof globalThis.window !== "undefined" && typeof globalThis.document !== "undefined";

let firebaseApp = null;
let firestoreDb = null;
let modulesPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadFirebaseModules() {
  if (modulesPromise) return modulesPromise;
  modulesPromise = (async () => {
    if (isBrowser) {
      const [appMod, fsMod] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
      ]);
      return { ...appMod, ...fsMod };
    }
    const appMod = await import("firebase/app");
    const fsMod = await import("firebase/firestore");
    return { ...appMod, ...fsMod };
  })();
  return modulesPromise;
}

async function getFirestoreDb() {
  if (firestoreDb) return firestoreDb;
  const { initializeApp, getFirestore } = await loadFirebaseModules();
  if (!firebaseApp) firebaseApp = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(firebaseApp);
  return firestoreDb;
}

function sdkDocToCard(docSnap) {
  const data = docSnap.data();
  if (!data || typeof data !== "object") return null;
  return { id: docSnap.id, ...data };
}

export class FirestoreFetchError extends Error {
  constructor(message, { status, code, cardsCollected = 0 } = {}) {
    super(message);
    this.name = "FirestoreFetchError";
    this.code = code;
    this.status = status || (code === "resource-exhausted" ? 429 : 0);
    this.cardsCollected = cardsCollected;
  }
}

function isResourceExhaustedError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "resource-exhausted" || /429|quota exceeded|resource.exhausted/i.test(message);
}

/** Fetch all cards from Firestore via Firebase JS SDK (same path as Deckmaker). */
export async function fetchAllFirebaseCards({ signal, initialDelayMs = 0 } = {}) {
  if (initialDelayMs > 0) await sleep(initialDelayMs);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  try {
    const { collection, getDocs } = await loadFirebaseModules();
    const db = await getFirestoreDb();
    const snapshot = await getDocs(collection(db, "cards"));
    const cards = [];
    snapshot.forEach((docSnap) => {
      const card = sdkDocToCard(docSnap);
      if (card?.id && card?.name) cards.push(card);
    });
    const fetchMeta = {
      source: "sdk",
      totalCards: cards.length,
      documentCount: snapshot.size,
      rateLimitEvents: [],
    };
    console.info(`[fetchAllFirebaseCards] SDK: ${cards.length} cards (${snapshot.size} docs)`);
    return Object.assign(cards, { fetchMeta });
  } catch (error) {
    if (isResourceExhaustedError(error)) {
      throw new FirestoreFetchError(error.message || "Firestore quota exceeded", {
        status: 429,
        code: error.code || "resource-exhausted",
      });
    }
    throw error;
  }
}
