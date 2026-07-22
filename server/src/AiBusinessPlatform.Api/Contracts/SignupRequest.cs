namespace AiBusinessPlatform.Api.Contracts;

// FR1/Section 19 step 1 — "A business can sign up and create a workspace (tenant)." Creates a
// Business plus its first BusinessUser (Role = Owner) in one call.
public record SignupRequest(string BusinessName, string IndustryType, string OwnerName, string Email, string Password);
