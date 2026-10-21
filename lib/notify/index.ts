import "server-only";
import { after } from "next/server";
import { consoleNotifier } from "./console";
import type { NewItemsEvent, OrderNotifier } from "./types";
import { whatsappNotifier } from "./whatsapp";

function getNotifier(): OrderNotifier {
  switch (process.env.NOTIFIER) {
    case "whatsapp":
      return whatsappNotifier();
    default:
      return consoleNotifier;
  }
}

// Fire-and-forget: runs after the response is sent, and never throws.
// The order is already saved by the time this runs.
export function notifyNewItemsAfterResponse(event: NewItemsEvent) {
  after(async () => {
    try {
      await getNotifier().notifyNewItems(event);
    } catch (err) {
      console.error("[notify] failed:", err);
    }
  });
}
