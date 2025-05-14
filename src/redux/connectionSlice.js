import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isOnline: navigator.onLine,
  isConnected: false,
  messages: [],
  error: null,
  lastConnectionStatus: localStorage.getItem("connectionStatus") || "unknown",
};

export const connectionSlice = createSlice({
  name: "connection",
  initialState,
  reducers: {
    setOnlineStatus: (state, action) => {
      state.isOnline = action.payload;
      localStorage.setItem(
        "connectionStatus",
        state.isOnline ? "online" : "offline"
      );
    },
    setConnectionStatus: (state, action) => {
      state.isConnected = action.payload;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearMessages: (state) => {
      state.messages = [];
    },
  },
});

export const {
  setOnlineStatus,
  setConnectionStatus,
  addMessage,
  setError,
  clearMessages,
} = connectionSlice.actions;

export default connectionSlice.reducer;
