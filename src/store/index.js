import { configureStore } from "@reduxjs/toolkit";
import candidates from "./candidateSlice";

export const store = configureStore({ reducer: { candidates } });
