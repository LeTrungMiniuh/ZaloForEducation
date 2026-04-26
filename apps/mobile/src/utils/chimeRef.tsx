/**
 * chimeRef - Global reference to the active Chime session's methods.
 * Used by AuthContext (socket listeners) to trigger cleanup when a call is hung up by the peer,
 * as AuthContext cannot use the useChime hook directly.
 */
export const chimeRef: { current: { cleanup: () => Promise<void> } | null } = {
  current: null,
};
