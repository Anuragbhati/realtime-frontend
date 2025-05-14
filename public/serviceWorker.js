/* eslint-disable no-restricted-globals */

const CACHE_NAME = "real-time-app-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/static/js/main.chunk.js",
  "/static/js/0.chunk.js",
  "/static/js/bundle.js",
  "/manifest.json",
  "/offline.html",
];

// IndexedDB to store connectivity status
const DB_NAME = "real-time-app-db";
const DB_VERSION = 1;
const STORE_NAME = "connectivity";

// Function to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("Error opening IndexedDB");
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

// Function to store data in IndexedDB
async function storeData(key, value) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.put({ id: key, value: value, timestamp: Date.now() });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = (event) => {
        console.error("Transaction error:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("Error storing data:", error);
    return false;
  }
}

// Function to retrieve data from IndexedDB
async function getData(key) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    return new Promise((resolve, reject) => {
      request.onsuccess = () =>
        resolve(request.result ? request.result.value : null);
      request.onerror = (event) => {
        console.error("Get data error:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("Error retrieving data:", error);
    return null;
  }
}

// Install a service worker
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Caching files");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Cache and return requests
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }

      // Clone the request
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest)
        .then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(async (error) => {
          console.log("Fetch failed; handling offline response", error);

          // If the request is for an HTML page, show the offline page
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/offline.html");
          }

          // For API requests, return a custom offline response
          if (
            event.request.url.includes("/api/") ||
            event.request.url.includes("/status")
          ) {
            return new Response(
              JSON.stringify({
                error: "You are offline",
                offline: true,
                timestamp: Date.now(),
              }),
              {
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          // For WebSocket connection attempts
          if (
            event.request.url.includes("ws://") &&
            event.request.method === "POST"
          ) {
            try {
              const messageData = await event.request.clone().json();

              // Store the message in IndexedDB for later sync
              const pendingMessages = (await getData("pendingMessages")) || [];
              pendingMessages.push({
                ...messageData,
                pendingId: Date.now().toString(),
                savedAt: new Date().toISOString(),
              });

              await storeData("pendingMessages", pendingMessages);

              return new Response(
                JSON.stringify({
                  status: "queued",
                  message: "Message saved for delivery when online",
                  timestamp: Date.now(),
                }),
                {
                  status: 202,
                  headers: { "Content-Type": "application/json" },
                }
              );
            } catch (err) {
              console.error("Error handling offline WebSocket request", err);
            }
          }

          // For other requests, return a generic offline response
          return new Response("Network error: You are currently offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        });
    })
  );
});

// Update a service worker
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating");
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log("Service Worker: Clearing old cache");
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Handle connectivity changes
self.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "CONNECTIVITY_CHANGE") {
    const status = event.data.status; // "online" or "offline"
    console.log(`Service Worker: Connectivity changed to ${status}`);

    try {
      await storeData("connectionStatus", status);
      console.log(`Service Worker: Stored connection status: ${status}`);

      // Notify all clients about the connectivity change
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({
          type: "CONNECTIVITY_UPDATE",
          status: status,
          timestamp: Date.now(),
        });
      });
    } catch (error) {
      console.error("Failed to store connection status:", error);
    }
  }
});

// Listen for sync events when connection is restored
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-messages") {
    console.log("Service Worker: Syncing pending messages");
    event.waitUntil(syncPendingMessages());
  }
});

// Function to sync pending messages when online
async function syncPendingMessages() {
  try {
    const pendingMessages = (await getData("pendingMessages")) || [];
    if (pendingMessages.length === 0) return;

    console.log(
      `Service Worker: Found ${pendingMessages.length} pending messages to sync`
    );

    // Attempt to send each pending message to the server
    // const serverUrl = self.registration.scope.replace(/\/$/, "");
    // const apiUrl = `${serverUrl.replace("ws://", "http://")}`;

    let successCount = 0;
    let failedMessages = [];

    for (const message of pendingMessages) {
      try {
        successCount++;
      } catch (err) {
        console.error("Failed to send message:", err);
        failedMessages.push(message);
      }
    }

    await storeData("pendingMessages", failedMessages);

    // Notify all clients about the synced messages
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "MESSAGES_SYNCED",
        count: successCount,
        remaining: failedMessages.length,
        timestamp: Date.now(),
      });
    });

    return successCount;
  } catch (error) {
    console.error("Error syncing pending messages:", error);
    return 0;
  }
}
