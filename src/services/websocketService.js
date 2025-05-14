import { store } from "../redux/store";
import {
  setConnectionStatus,
  addMessage,
  setError,
} from "../redux/connectionSlice";

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3 seconds
    this.heartbeatInterval = null;
    this.serverUrl = "ws://localhost:8080";
  }

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      console.log("WebSocket is already connected or connecting");
      return;
    }

    if (!navigator.onLine) {
      console.log("Cannot connect: Browser is offline");
      store.dispatch(
        setError("Failed to connect to the server. You are offline.")
      );
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = this.onOpen.bind(this);
      this.socket.onmessage = this.onMessage.bind(this);
      this.socket.onclose = this.onClose.bind(this);
      this.socket.onerror = this.onError.bind(this);
    } catch (error) {
      console.error("WebSocket connection error:", error);
      this.isConnecting = false;
      store.dispatch(setError("Failed to connect to the server."));
    }
  }

  onOpen() {
    console.log("WebSocket connected");
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    store.dispatch(setConnectionStatus(true));

    // Start heartbeat to keep connection alive
    this.startHeartbeat();
  }

  onMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log("Message received:", message);
      store.dispatch(addMessage(message));
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  onClose(event) {
    console.log("WebSocket disconnected:", event.code, event.reason);
    this.isConnecting = false;
    store.dispatch(setConnectionStatus(false));

    // Clear heartbeat interval
    this.stopHeartbeat();

    // Attempt to reconnect if not a normal closure and browser is online
    if (
      event.code !== 1000 &&
      navigator.onLine &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.attemptReconnect();
    }
  }

  onError(error) {
    console.error("WebSocket error:", error);
    this.isConnecting = false;
    store.dispatch(setError("Connection error. Please try again."));
  }

  attemptReconnect() {
    this.reconnectAttempts++;
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect();
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.stopHeartbeat();
  }

  sendMessage(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error("Cannot send message: WebSocket is not connected");
      store.dispatch(setError("Message saved for later delivery"));

      // Store message for later delivery when offline
      this.storePendingMessage(message);
    }
  }

  // Store message in IndexedDB when offline
  async storePendingMessage(message) {
    if (!("indexedDB" in window)) {
      console.error("IndexedDB not supported");
      return;
    }

    try {
      const request = indexedDB.open("real-time-app-db", 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("connectivity")) {
          db.createObjectStore("connectivity", { keyPath: "id" });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(["connectivity"], "readwrite");
        const store = transaction.objectStore("connectivity");

        // Get existing pending messages
        const getRequest = store.get("pendingMessages");

        getRequest.onsuccess = () => {
          const pendingMessages = getRequest.result?.value || [];
          pendingMessages.push({
            ...message,
            pendingId: Date.now().toString(),
            savedAt: new Date().toISOString(),
          });

          // Store updated pending messages
          store.put({
            id: "pendingMessages",
            value: pendingMessages,
            timestamp: Date.now(),
          });

          console.log("Message stored for later delivery", message);
        };

        transaction.oncomplete = () => {
          db.close();

          // Register for background sync if supported
          if (
            "serviceWorker" in navigator &&
            "SyncManager" in window &&
            navigator.serviceWorker.controller
          ) {
            navigator.serviceWorker.ready.then((registration) => {
              registration.sync
                .register("sync-messages")
                .catch((err) =>
                  console.error("Sync registration failed:", err)
                );
            });
          }
        };
      };

      request.onerror = (event) => {
        console.error("Error opening IndexedDB:", event.target.error);
      };
    } catch (error) {
      console.error("Error storing pending message:", error);
    }
  }

  startHeartbeat() {
    // Clear any existing interval
    this.stopHeartbeat();

    // Send a ping every 25 seconds to keep the connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: "ping", timestamp: new Date().toISOString() });
      }
    }, 25000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

const websocketService = new WebSocketService();

// Handle browser online/offline events
window.addEventListener("online", () => {
  console.log("Browser is online");
  websocketService.connect();
});

window.addEventListener("offline", () => {
  console.log("Browser is offline");
  store.dispatch(setConnectionStatus(false));
});

export default websocketService;
