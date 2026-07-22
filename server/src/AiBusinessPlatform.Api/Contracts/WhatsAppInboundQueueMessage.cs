namespace AiBusinessPlatform.Api.Contracts;

// The whatsapp.inbound queue wire format — replaces SimulatedWhatsAppMessage as the envelope
// actually published to the queue. BusinessId is resolved ONCE at ingress (Section 9.3: "tenant
// context is loaded, never inferred") — from a real Meta webhook via WhatsAppConnection lookup by
// phone_number_id, or from the simulated endpoint via the usual ICurrentTenantProvider/
// X-Business-Id header — and carried through so WhatsAppOrchestratorConsumer never has to
// re-derive it from message content.
public record WhatsAppInboundQueueMessage(Guid BusinessId, string CustomerNumber, string Text, string? WhatsAppMessageId);
