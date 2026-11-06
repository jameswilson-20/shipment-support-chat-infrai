import test from "node:test";
import assert from "node:assert/strict";
import { decideException } from "./support_chat.ts";

test("high-severity carrier exception goes to a human", () => {
  const decision = decideException({
    shipmentId: "SHP-2048",
    visitorEmail: "visitor@example.com",
    event: { type: "delayed", occurredAt: "2026-01-01T10:00:00Z", location: "Rotterdam" },
    proofOfDelivery: null,
    exception: { code: "carrier_delay", severity: "high", summary: "Window missed" }
  });
  assert.equal(decision, "human_review");
});
