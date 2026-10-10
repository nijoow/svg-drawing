import { parseDocument, type EditorDocument } from './document'

export const HISTORY_LIMIT = 50

export interface EditorHistory {
  past: EditorDocument[]
  present: EditorDocument
  future: EditorDocument[]
  transaction: EditorDocument | null
}

export type HistoryAction =
  | { type: 'change'; document: EditorDocument }
  | { type: 'replace'; document: EditorDocument }
  | { type: 'begin' | 'end' | 'cancel' | 'undo' | 'redo' }

export function createHistory(document: EditorDocument): EditorHistory {
  return { past: [], present: document, future: [], transaction: null }
}

function same(a: EditorDocument, b: EditorDocument): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function append(past: EditorDocument[], document: EditorDocument): EditorDocument[] {
  return [...past.slice(-(HISTORY_LIMIT - 1)), document]
}

export function historyReducer(state: EditorHistory, action: HistoryAction): EditorHistory {
  switch (action.type) {
    case 'replace':
      return createHistory(action.document)
    case 'begin':
      return state.transaction ? state : { ...state, transaction: state.present }
    case 'end':
      if (!state.transaction) return state
      if (same(state.transaction, state.present)) return { ...state, present: state.transaction, transaction: null }
      return { ...state, past: append(state.past, state.transaction), future: [], transaction: null }
    case 'cancel':
      return state.transaction ? { ...state, present: state.transaction, transaction: null } : state
    case 'change':
      // Avoid serializing an entire document on every pointer move. A transaction
      // is compared once at commit, including a drag that returns to its origin.
      if (state.transaction ? state.present === action.document : same(state.present, action.document)) return state
      return state.transaction
        ? { ...state, present: action.document }
        : { ...state, present: action.document, past: append(state.past, state.present), future: [] }
    case 'undo': {
      const committed = state.transaction ? historyReducer(state, { type: 'end' }) : state
      if (!committed.past.length) return committed
      return {
        past: committed.past.slice(0, -1),
        present: committed.past[committed.past.length - 1],
        future: [committed.present, ...committed.future].slice(0, HISTORY_LIMIT),
        transaction: null,
      }
    }
    case 'redo': {
      const committed = state.transaction ? historyReducer(state, { type: 'end' }) : state
      if (!committed.future.length) return committed
      return {
        past: append(committed.past, committed.present),
        present: committed.future[0],
        future: committed.future.slice(1),
        transaction: null,
      }
    }
  }
}

/** Validate completed edits only, so pointer previews remain inexpensive. */
export function applyHistoryAction(
  state: EditorHistory,
  action: HistoryAction,
): { history: EditorHistory; error: string | null } {
  let candidate: EditorDocument | undefined
  if (action.type === 'replace' || (action.type === 'change' && !state.transaction)) candidate = action.document
  if (state.transaction && ['end', 'undo', 'redo'].includes(action.type)) candidate = state.present
  if (candidate) {
    try {
      // Import and editing use exactly the same limits. Every accepted document
      // can therefore be saved and reopened, including after a large transform.
      parseDocument(JSON.stringify(candidate))
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The document is outside the supported limits.'
      return {
        history:
          state.transaction && ['end', 'undo', 'redo'].includes(action.type)
            ? historyReducer(state, { type: 'cancel' })
            : state,
        error: `The change was not applied: ${reason} Try a smaller edit or start a new document.`,
      }
    }
  }
  return { history: historyReducer(state, action), error: null }
}
