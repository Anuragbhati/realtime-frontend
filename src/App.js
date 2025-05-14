import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setOnlineStatus } from "./redux/connectionSlice";
import websocketService from "./services/websocketService";
import "./App.css";

function App() {
  const dispatch = useDispatch();
  const { isOnline, isConnected, messages, error } = useSelector(
    (state) => state.connection
  );
  const [message, setMessage] = useState("");

  // Check online status on component mount and set up listeners
  useEffect(() => {
    // Initial online status
    dispatch(setOnlineStatus(navigator.onLine));

    // Set up event listeners for online/offline status
    const handleOnline = () => {
      dispatch(setOnlineStatus(true));

      // Register background sync when back online
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready
          .then((registration) => {
            return registration.sync.register("sync-messages");
          })
          .catch((err) =>
            console.error("Background sync registration failed:", err)
          );
      }
    };

    const handleOffline = () => {
      dispatch(setOnlineStatus(false));
    };

    // Listen for messages from service worker
    const handleServiceWorkerMessage = (event) => {
      if (event.data && event.data.type === "CONNECTIVITY_UPDATE") {
        console.log(
          "Received connectivity update from service worker:",
          event.data.status
        );
        dispatch(setOnlineStatus(event.data.status === "online"));
      }

      if (event.data && event.data.type === "MESSAGES_SYNCED") {
        console.log(`Service worker synced ${event.data.count} messages`);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage
      );
    }

    // Notify service worker about connectivity changes
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "CONNECTIVITY_CHANGE",
        status: navigator.onLine ? "online" : "offline",
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage
        );
      }
    };
  }, [dispatch]);

  // Connect to WebSocket when online
  useEffect(() => {
    if (isOnline) {
      websocketService.connect();
    } else {
      websocketService.disconnect();
    }

    return () => {
      websocketService.disconnect();
    };
  }, [isOnline]);

  useEffect(() => {
    const connectionStatus = localStorage.getItem("connectionStatus");
    if (
      !navigator.onLine &&
      (!connectionStatus || connectionStatus === "offline")
    ) {
      // Show offline page if loaded without connection
      document.body.innerHTML = "";
      fetch("/offline.html")
        .then((response) => response.text())
        .then((html) => {
          document.body.innerHTML = html;
        })
        .catch((err) => {
          console.error("Failed to load offline page:", err);
          document.body.innerHTML =
            '<div style="text-align:center;padding:50px;"><h1>Failed to connect to the server.</h1><p>Please check your internet connection and try again.</p></div>';
        });
    }
  }, []);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && isConnected) {
      websocketService.sendMessage({
        type: "message",
        content: message,
        timestamp: new Date().toISOString(),
      });
      setMessage("");
    }
  };

  // If offline, show offline indicator
  if (!isOnline) {
    return (
      <div className="app">
        <div
          className={`connection-status ${
            isConnected ? "connected" : "disconnected"
          }`}
        >
          {isConnected ? "Connected" : "Disconnected"}
        </div>
        <div className="offline-indicator">
          <h1>You're Offline</h1>
          <p>Please check your internet connection and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Real-Time Connectivity App</h1>
        <div
          className={`connection-status ${
            isConnected ? "connected" : "disconnected"
          }`}
        >
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </header>

      <main className="app-main">
        {error && <div className="error-message">{error}</div>}

        <div className="message-container">
          {messages.map((msg, index) => (
            <div key={index} className="message">
              <div className="message-content">
                {msg.data?.content || msg.message}
              </div>
              <div className="message-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        <form className="message-form" onSubmit={handleSendMessage}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={!isConnected}
          />
          <button type="submit" disabled={!isConnected}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
