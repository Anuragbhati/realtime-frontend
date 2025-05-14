import { configureStore } from "@reduxjs/toolkit";
import connectionReducer from "./connectionSlice";

export const store = configureStore({
  reducer: {
    connection: connectionReducer,
  },
});
