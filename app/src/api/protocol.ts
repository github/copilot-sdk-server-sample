// This type is shared between "api" and "web-ui" to describe the commands that
// the frontend can send to the backend over the WebSocket connection.
export type ClientCommand =
  | { type: "user.submit"; content: string };
