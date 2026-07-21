namespace AiBusinessPlatform.Api.Contracts;

// Decision: "approve" or "reject" (case-insensitive). DecidedBy: Phase 0 has no real auth/session
// (Section 14/15 — same gap flagged for HttpBusinessIdTenantProvider's X-Business-Id header), so
// this is optionally caller-supplied and defaults to the seeded dev BusinessUser if omitted.
public record ApprovalDecisionRequest(string Decision, Guid? DecidedBy);
