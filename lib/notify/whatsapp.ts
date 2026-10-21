import { itemsSummary } from "./console";
import type { OrderNotifier } from "./types";

// WhatsApp Cloud API, utility template message.
// The template must be approved in Meta Business Manager with two body
// variables: {{1}} = table name, {{2}} = item summary.
export function whatsappNotifier(): OrderNotifier {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TEMPLATE_NAME ?? "new_kitchen_order";
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";
  const recipients = (process.env.WHATSAPP_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    async notifyNewItems(event) {
      if (!token || !phoneNumberId || recipients.length === 0) {
        console.warn("[notify] WhatsApp not configured; skipping");
        return;
      }
      // Template variables can't contain newlines; keep it on one line.
      const summary = itemsSummary(event.items).slice(0, 1000);
      const results = await Promise.allSettled(
        recipients.map(async (to) => {
          const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to,
              type: "template",
              template: {
                name: template,
                language: { code: lang },
                components: [
                  {
                    type: "body",
                    parameters: [
                      { type: "text", text: event.tableName },
                      { type: "text", text: summary },
                    ],
                  },
                ],
              },
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        }),
      );
      results.forEach((r, i) => {
        if (r.status === "rejected") console.error(`[notify] WhatsApp to ${recipients[i]} failed:`, r.reason);
      });
    },
  };
}
