namespace AiBusinessPlatform.Api.Contracts;

// STAND-IN for a real Meta WhatsApp Cloud API webhook payload (Section 13.1). A future pass
// parses the actual Meta JSON structure and maps it into this same shape (or a superset), so the
// queue contract and WhatsAppOrchestratorConsumer don't need to change when that lands.
public record SimulatedWhatsAppMessage(string CustomerNumber, string Text);
