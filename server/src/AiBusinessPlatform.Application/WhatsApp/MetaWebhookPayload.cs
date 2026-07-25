using System.Text.Json.Serialization;

namespace AiBusinessPlatform.Application.WhatsApp;

// Section 13.1 — Meta Cloud API webhook payload shapes for an inbound message. Matches Meta's
// documented Cloud API / the official WhatsApp Business Platform Postman collection. Only the
// fields this platform actually uses are modeled; unrecognized fields are ignored by
// System.Text.Json by default.
public record MetaWebhookPayload(
    [property: JsonPropertyName("object")] string Object,
    [property: JsonPropertyName("entry")] IReadOnlyList<MetaWebhookEntry>? Entry);

public record MetaWebhookEntry(
    [property: JsonPropertyName("id")] string Id, // WABA id
    [property: JsonPropertyName("changes")] IReadOnlyList<MetaWebhookChange>? Changes);

public record MetaWebhookChange(
    [property: JsonPropertyName("value")] MetaWebhookValue Value,
    [property: JsonPropertyName("field")] string Field); // "messages" for inbound messages

public record MetaWebhookValue(
    [property: JsonPropertyName("messaging_product")] string? MessagingProduct,
    [property: JsonPropertyName("metadata")] MetaWebhookMetadata Metadata,
    [property: JsonPropertyName("contacts")] IReadOnlyList<MetaWebhookContact>? Contacts,
    [property: JsonPropertyName("messages")] IReadOnlyList<MetaWebhookMessage>? Messages,
    // Meta sends delivery/read status callbacks (sent/delivered/read/failed) in this array,
    // alongside (never mixed into) the messages array above — same webhook endpoint, different
    // payload shape distinguished by which of these two arrays is present.
    [property: JsonPropertyName("statuses")] IReadOnlyList<MetaWebhookStatus>? Statuses);

public record MetaWebhookMetadata(
    [property: JsonPropertyName("display_phone_number")] string? DisplayPhoneNumber,
    [property: JsonPropertyName("phone_number_id")] string PhoneNumberId);

public record MetaWebhookContact(
    [property: JsonPropertyName("wa_id")] string WaId,
    [property: JsonPropertyName("profile")] MetaWebhookProfile? Profile);

public record MetaWebhookProfile(
    [property: JsonPropertyName("name")] string? Name);

public record MetaWebhookMessage(
    [property: JsonPropertyName("from")] string From,
    [property: JsonPropertyName("id")] string Id, // -> Message.WhatsAppMessageId
    [property: JsonPropertyName("timestamp")] string? Timestamp, // epoch seconds as a JSON string
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("text")] MetaWebhookText? Text);

public record MetaWebhookText(
    [property: JsonPropertyName("body")] string Body);

public record MetaWebhookStatus(
    [property: JsonPropertyName("id")] string Id, // the wamid this status is about -> Message.WhatsAppMessageId
    [property: JsonPropertyName("status")] string Status, // "sent" | "delivered" | "read" | "failed"
    [property: JsonPropertyName("timestamp")] string? Timestamp, // epoch seconds as a JSON string
    [property: JsonPropertyName("recipient_id")] string? RecipientId,
    [property: JsonPropertyName("errors")] IReadOnlyList<MetaWebhookStatusError>? Errors);

public record MetaWebhookStatusError(
    [property: JsonPropertyName("code")] int Code,
    [property: JsonPropertyName("title")] string? Title,
    [property: JsonPropertyName("message")] string? Message);
