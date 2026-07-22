using System.Text.Json.Serialization;

namespace AiBusinessPlatform.Infrastructure.WhatsApp;

// Meta Cloud API's documented success response shape for POST /{phone-number-id}/messages.
public record MetaSendMessageResponse(
    [property: JsonPropertyName("messaging_product")] string? MessagingProduct,
    [property: JsonPropertyName("contacts")] IReadOnlyList<MetaSendMessageContact>? Contacts,
    [property: JsonPropertyName("messages")] IReadOnlyList<MetaSendMessageId>? Messages);

public record MetaSendMessageContact(
    [property: JsonPropertyName("input")] string? Input,
    [property: JsonPropertyName("wa_id")] string? WaId);

public record MetaSendMessageId(
    [property: JsonPropertyName("id")] string Id);
