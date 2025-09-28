// src/store/candidateSlice.js
import { createSlice, createSelector } from "@reduxjs/toolkit";

const initialState = { byId: {}, allIds: [] };

const slice = createSlice({
  name: "candidates",
  initialState,
  reducers: {
    upsertCandidate: (state, action) => {
      const c = action.payload || {};
      const id =
        c.id ||
        c.email ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()));
      if (!state.byId[id]) state.allIds.push(id);
      state.byId[id] = { id, ...c };
      // NOTE: Immer will keep object identities for fields we didn't change,
      // so `byId` and `allIds` references only change when we truly update.
    },
    resetCandidates: (state) => {
      state.byId = {};
      state.allIds = [];
    },
  },
});

export const { upsertCandidate, resetCandidates } = slice.actions;

/* ──────────────────────────────────────────────────────────
   Input selectors (stable, do not allocate):
   These simply pluck references from the redux state.
   They should *not* compute/allocate new objects/arrays.
   ────────────────────────────────────────────────────────── */
const selectCandidatesState = (state) => state.candidates;
const selectAllIds = (state) => state.candidates.allIds;
const selectById = (state) => state.candidates.byId;

/* ──────────────────────────────────────────────────────────
   Memoized selector:
   - Returns the *same array reference* if `allIds` and `byId`
     are the same references as the previous call.
   - Only recomputes when either input reference changes.
   - Safe to do `.map()` and `.sort()` inside; it won’t run
     unless the inputs changed.
   ────────────────────────────────────────────────────────── */
export const selectCandidates = createSelector(
  [selectAllIds, selectById],
  (allIds, byId) => {
    // Build array in the ID order first, then sort by finalScore
    const arr = allIds.map((id) => byId[id]);
    // Keep your sort preference (highest score first; nulls last)
    arr.sort((a, b) => (b?.finalScore ?? -1) - (a?.finalScore ?? -1));
    return arr;
  }
);

/* Optional helper: select one candidate by id (memo-friendly when used with props) */
export const makeSelectCandidateById = () =>
  createSelector(
    [selectById, (_state, id) => id],
    (byId, id) => byId[id]
  );

export default slice.reducer;
