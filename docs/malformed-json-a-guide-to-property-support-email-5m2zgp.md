# Malformed JSON: A Guide to Property Support Email Response Boundaries

Choose who owns the notification template before deciding how a malformed JSON response should affect a property contact form. The support queue should remain identifiable even when the email send response cannot be parsed. Otherwise, a notification problem can become a lost maintenance request.

TL;DR: Preserve the response status, media type, and a restricted diagnostic record before parsing. Check the response against the documented JSON contract, and treat an unreadable send acknowledgment as an unknown notification outcome. Keep queue assignment and template revision in the application record; reconcile the email attempt before deciding whether another send is safe.

This decision record concerns a property management contact form that routes a resident's message to the appropriate support queue. Its decision axis is template ownership: who controls the subject, body, and fields needed to explain that assignment? The proposed boundary keeps the routing decision in the application and makes email a notification of that decision. All identifiers and limits below are illustrative design choices, not service guarantees.

## What does a malformed JSON response actually establish?

Only that a particular response could not be interpreted under the expected contract. It doesn't, by itself, establish whether the send operation took effect. HTTP semantics distinguish status information from representation metadata; JSON syntax is another layer. A successful status accompanied by unreadable content therefore needs investigation across those layers, rather than an immediate conclusion about delivery. RFC 9110 describes HTTP semantics, while RFC 8259 defines JSON syntax and interoperability requirements.

Start with the actual response.

Record the status, declared content type, byte count, and the application's attempt identifier. Preserve a small, access-controlled byte sample only when necessary to diagnose the syntax problem. A parser exception without those surrounding details leaves too much ambiguity: an empty body, a non-JSON document, invalid character encoding, and JSON with the wrong shape require different explanations.

Keep evidence bounded.

A contact form can contain a resident's phone number, apartment identifier, or maintenance details. The proposed logging policy excludes request bodies, credentials, and rendered templates from routine logs; it retains diagnostic samples separately with restricted access and a defined deletion period. A truncated sample can show where parsing started, but it cannot establish that the complete response was valid. Avoid turning a debugging exercise into another copy of the resident's message.

If the response is valid JSON but lacks the documented acknowledgment field, classify that as a contract mismatch. A JSON array, string, or null can be syntactically valid under RFC 8259. Parsing success is insufficient evidence that the application received the object it expected. Also inspect duplicate object names: RFC 8259 says names should be unique and describes inconsistent receiver behavior when they are not. A strict boundary can reject them deliberately.

## Decision: preserve routing and template ownership across the send boundary

The proposed invariant is straightforward: the durable support request identifies its queue before a notification worker sends email. For example, request `case-270` belongs to property `building-c`, queue `maintenance`, and application template revision `maintenance-v3`. These are fictional example values. Queue selection follows validated form fields and application rules; parsing an email response never chooses the support destination.

Store an attempt record before the worker makes the send call. Associate it with the support request, queue, and immutable template revision. Record enough information to reconstruct the decision without retaining an unnecessary second copy of the resident's free text. A malformed acknowledgment moves that attempt into an explicit unknown state. It does not delete the request, change its queue, or prove that no notification exists. Consider a hypothetical handoff: `case-270` has already been assigned to maintenance, the worker records an attempt for `maintenance-v3`, and the response arrives with a body the parser rejects. If operations then edits the template, a replay that silently resolves the template's current version would no longer reproduce the original attempt, even though the support request and intended queue have not changed. Preserve the original revision for reconciliation; treat a deliberate notification using revised wording as a separate decision. The queue owner needs to see an actionable request throughout this sequence, while the notification owner needs evidence about which rendering was attempted and why the acknowledgment remains unresolved.

Keep those responsibilities separate.

This separates three questions that tend to get collapsed during troubleshooting: did the application accept and route the contact form, did the sending system acknowledge the notification, and what delivery evidence exists afterward? A local parsing failure answers none of the other two. SPF also belongs to a different boundary: RFC 7208 defines authorization of hosts to use a domain in SMTP identities. Correcting JSON syntax does not establish SPF authorization or inbox placement.

Template ownership determines which team can reproduce the rendered message and which release process must approve a change. It should not determine whether the support request survives.

| Ownership option | Proposed change boundary | Diagnostic trade-off | Appropriate condition |
| --- | --- | --- | --- |
| Application-owned templates | Review routing fields and template revision together in the application release | The attempt can reference an immutable application revision; editorial changes require that release process | Queue meaning and notification wording must change together |
| Externally managed templates | Application sends an approved template identifier and variables | Reproduction requires access to the exact external revision and its variable contract | Operations staff need an independent wording approval process |
| Split ownership | Application owns queue fields; another team owns editable wording | Both revisions must be recorded to explain the final message | Responsibilities are explicit and integration checks cover both contracts |

For this design, choose application-owned templates because the notification must explain the same queue assignment that the application recorded. The trade-off is slower independent wording changes. That's an organizational cost, not a claim that another ownership model has worse email delivery.

## Critical path: classify the acknowledgment without sending again

The following Python boundary operates on an already captured response. Its fictional adapter contract expects an HTTP 202 response with an `application/json` object containing a nonempty `message_id` string. Substitute the actual documented contract at integration time. The local memory bound is 64 KiB (65,536 bytes). The accepted identifier is evidence of an acknowledgment under this example contract, not proof of delivery.

```python
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class Observation:
    state: str
    reason: str
    message_id: str | None = None


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate object name")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("non-JSON numeric constant")


def inspect_ack(status: int, content_type: str, body: bytes) -> Observation:
    media_type = content_type.partition(";")[0].strip().lower()
    if status != 202:
        return Observation("unknown", "status outside example contract")
    if media_type != "application/json":
        return Observation("unknown", "unexpected media type")
    if not body or len(body) > 65_536:
        return Observation("unknown", "empty or oversized body")
    try:
        document = json.loads(
            body.decode("utf-8"),
            object_pairs_hook=unique_object,
            parse_constant=reject_constant,
        )
    except (UnicodeDecodeError, ValueError, RecursionError):
        return Observation("unknown", "invalid JSON representation")
    if not isinstance(document, dict):
        return Observation("unknown", "expected acknowledgment object")
    message_id = document.get("message_id")
    if not isinstance(message_id, str) or not message_id.strip():
        return Observation("unknown", "missing acknowledgment identifier")
    return Observation("acknowledged", "contract matched", message_id)
```

This deliberately returns classifications rather than retrying. HTTP permits automatic repetition only under appropriate method and application semantics; RFC 9110 warns against automatically retrying a non-idempotent request without knowledge that it is safe. If the sending interface documents an idempotency mechanism, preserve its identity across attempts according to that contract. Otherwise, use the documented status lookup or reconciliation process before authorizing a repeat. If no such evidence is available, leave the outcome unknown and expose it to an operator.

Don't repair the response with string replacement.

Removing commas or extracting a substring between braces could turn an unexpected document into something that appears usable while discarding the evidence needed to identify its source. Likewise, logging the entire body on every exception is an unnecessary expansion of the diagnostic data boundary.

## Verification and deployment belong to the same decision

Test the boundary with a valid acknowledgment, an empty body, a non-JSON media type, invalid UTF-8, a trailing comma, duplicate names, and a valid JSON value with the wrong shape. Include a Unicode resident-facing template in rendering tests, using synthetic data. The decisive workflow test is that an unreadable acknowledgment leaves `case-270` assigned to `maintenance` and creates no automatic second send. That checks the business invariant, rather than merely asserting which parser exception occurred.

Before deployment, review the routing rules and template revision together. Exercise the worker's restart boundary: an interrupted attempt must remain visible for reconciliation. Changing the response adapter should not require changing the support request's queue, and a wording-only release should not silently alter the acknowledgment contract. These are proposed release checks, not properties supplied by JSON itself.

Measure unknown outcomes separately from acknowledged sends and later delivery events. Group diagnostics by adapter revision, template revision, and reason code; keep resident identifiers out of metric labels. A spike in representation errors calls for inspection of the captured HTTP evidence. Authentication and delivery investigations need their own evidence. Mixing them into one failure counter makes the next incident harder to localize.

Storage has costs too.

A bounded diagnostic record and an explicit template owner make review work estimable without making message pricing the architecture's deciding factor.

## Rejected option: make email acknowledgment the queue receipt

Reject a design that considers the contact form routed only after the email response parses. It couples the resident's support request to a notification representation and leaves an ambiguous send outcome entangled with business acceptance. The selected design pays for a durable request record and reconciliation workflow to keep that boundary explicit.

An email-centered design has a valid use case when a mailbox is intentionally the sole support system of record and the form is only a convenience interface. In that case, define acceptance and recovery around that mailbox workflow, retain the submission evidence, and tell the resident what the acknowledgment actually means. For a property application that promises queue assignment, keep that promise anchored to its own durable routing decision.

## References

- RFC 8259, The JavaScript Object Notation (JSON) Data Interchange Format: https://datatracker.ietf.org/doc/html/rfc8259
- RFC 9110, HTTP Semantics: https://datatracker.ietf.org/doc/html/rfc9110
- RFC 7208, Sender Policy Framework (SPF): https://datatracker.ietf.org/doc/html/rfc7208
