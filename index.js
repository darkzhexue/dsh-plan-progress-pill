/**
 * Host half of the plan-progress pill.
 *
 * The user-facing surface is the client module (see client.js), which reads the
 * current session's `todos` projection through its bound session scopes. The
 * host side therefore has nothing to do beyond a no-op apply.
 */
export function apply() {}
