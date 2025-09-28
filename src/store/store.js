// src/store/store.js
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import candidates from "./candidateSlice";
import interview from "./interviewSlice";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";

const rootReducer = combineReducers({
  candidates,
  interview,
});

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["candidates", "interview"],
  version: 1,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(store);
