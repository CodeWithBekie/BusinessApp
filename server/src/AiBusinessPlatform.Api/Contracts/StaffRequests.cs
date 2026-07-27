using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record InviteStaffRequest(string Name, string Email, string Password, BusinessUserRole Role);

// PATCH semantics — only supplied (non-null) fields change.
public record UpdateStaffRequest(BusinessUserRole? Role, bool? IsActive);
