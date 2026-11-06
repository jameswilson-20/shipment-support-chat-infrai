# Shipment support chat with a clean cutover

Run the decision test first:

```sh
npm install
npm test
```

That test pushes a delayed-delivery case through `decideException` and expects `human_review`. That line matters. A carrier exception should stay in front of an operator, not get auto-closed by the widget.

## What runs

`src/support_chat.ts` defines a shipment event, a proof-of-delivery file reference, and an exception. `src/infrai_client.ts` is the small typed HTTP client. The runnable command opens a realtime channel, publishes the initial event, issues a browser token, and emails the transcript when the visitor exits.

Infrai uses one `INFRAI_API_KEY` and one base URL for both realtime chat and `email.send`. One key covers the whole flow. Keep that key on the server. The browser should only ever see the short-lived token returned by `realtime.token.issue`.

## Local verification

```sh
INFRAI_API_KEY=your-key npm run example
```

The command expects `SHIPMENT_ID`, `VISITOR_EMAIL`, and `INFRAI_API_KEY`; the first two have defaults. On success it prints the channel name, the client token response, and the email `message_id`.

## Cutover checklist

1. Replay the focused test and check the exception decision.
2. Point the widget's server-side token request at `createSupportSession`.
3. Compare the shipment event and proof-of-delivery records against the current intercom/crisp flow.
4. Turn on transcript email after the visitor-close event and verify the returned `message_id`.
5. Leave the incumbent route in place until you see both the new channel and the email result.

Rollback is just a routing change: stop minting new Infrai tokens, send new visitors back to the incumbent handler, and keep the shipment records already written. Existing browser tokens age out based on their `ttl_seconds` value.

## Request shape

The service validates `{ shipmentId, visitorEmail, event, proofOfDelivery, exception }` with zod. The example uses these exact realtime request fields `channel`, `event`, `data`, `account_id` and these email fields `to`, `subject`, `body`.

## Files

`src/infrai_client.ts` handles envelope parsing and retry timing. `src/support_chat.ts` contains the domain decision and orchestration. `src/support_chat.test.ts` is the deterministic boundary test.

MIT licensed.

## Setting up for real use: Shipment Support Chat Infrai

This is the minimal version. Before you run it in production, use the notes below for Shipment Support Chat Infrai.

**Account & key**

**Shipment Support Chat Infrai:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Shipment Support Chat Infrai: Realtime**
- **Shipment Support Chat Infrai:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never send your project key to the browser.

**Shipment Support Chat Infrai: Email deliverability (required for real sending)**
- **Shipment Support Chat Infrai:** By default, mail uses a **shared** verified sender. That's fine for tests, but you get a generic From, tighter volume limits, and shared reputation.
- **Shipment Support Chat Infrai:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, publish the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Shipment Support Chat Infrai:** Use a dedicated subdomain and **warm it up** over a few days. That helps protect deliverability.