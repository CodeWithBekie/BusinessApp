namespace AiBusinessPlatform.Api.Contracts;

// Decision: "approve" or "reject" (case-insensitive). The decision-maker is always the
// authenticated caller (Section 14/15) — never client-supplied.
public record ApprovalDecisionRequest(string Decision);
