import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

// The client-side connection uses the realtime.token.issue capability.

const requestSchema = z.object({
  shipmentId: z.string().min(1),
  visitorEmail: z.string().email(),
  event: z.object({ type: z.string(), occurredAt: z.string(), location: z.string() }),
  proofOfDelivery: z.object({ name: z.string(), contentType: z.string(), reference: z.string() }).nullable(),
  exception: z.object({ code: z.string(), severity: z.enum(["low", "high"]), summary: z.string() }).nullable()
});

export type SupportRequest = z.infer<typeof requestSchema>;
export type ExceptionDecision = "self_service" | "human_review";

export function decideException(input: SupportRequest): ExceptionDecision {
  return input.exception?.severity === "high" ? "human_review" : "self_service";
}

export async function createSupportSession(input: unknown): Promise<{ channel: string; token: string; messageId: string }> {
  const request = requestSchema.parse(input);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new InfraiClient(key);
  const channel = `shipment-${request.shipmentId}`;
  await client.request("POST", "/v1/realtime/channel/create", { channel, type: "support", vendor: "logistics" });
  await client.request("POST", "/v1/realtime/publish", {
    channel,
    event: "shipment.support.opened",
    data: { event_id: `open-${request.shipmentId}`, shipment: request, decision: decideException(request) },
    account_id: request.shipmentId
  });
  const token = await client.request<{ token: string }>("POST", "/v1/realtime/token/issue", {
    client_id: `visitor-${request.shipmentId}`,
    channels: [channel],
    capabilities: ["publish", "subscribe"],
    ttl_seconds: 900
  });
  const email = await client.request<{ message_id: string }>("POST", "/v1/email/send", {
    to: request.visitorEmail,
    subject: `Shipment ${request.shipmentId} support transcript`,
    body: `Shipment ${request.shipmentId} opened support with decision ${decideException(request)}.`,
  });
  return { channel, token: token.token, messageId: email.message_id };
}

if (import.meta.main) {
  const result = await createSupportSession({
    shipmentId: process.env.SHIPMENT_ID ?? "SHP-2048",
    visitorEmail: process.env.VISITOR_EMAIL ?? "visitor@example.com",
    event: { type: "delayed", occurredAt: new Date().toISOString(), location: "Rotterdam" },
    proofOfDelivery: { name: "pod.pdf", contentType: "application/pdf", reference: "pod-SHP-2048" },
    exception: { code: "carrier_delay", severity: "high", summary: "Delivery window missed" }
  });
  console.log(JSON.stringify(result, null, 2));
}
