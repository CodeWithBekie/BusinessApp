namespace AiBusinessPlatform.Api.Contracts;

// STAND-IN for Meta's real embedded-signup/OAuth onboarding flow (Section 12.3, 19) — the operator
// manually pastes in values obtained directly from Meta's own dashboard. A future pass replaces
// this with the real embedded-signup flow; the WhatsAppConnection row shape doesn't need to change.
public record WhatsAppConnectRequest(string WabaId, string PhoneNumberId, string SystemUserToken);
