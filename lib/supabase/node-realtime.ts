import ws from "ws";

// Node 20 has no built-in WebSocket, and supabase-js creates a realtime client
// even when a server-side client never subscribes. Pass this as `realtime`.
export const nodeRealtime = { transport: ws as unknown as typeof WebSocket };
