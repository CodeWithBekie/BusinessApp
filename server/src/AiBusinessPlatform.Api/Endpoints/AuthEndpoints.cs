using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Auth;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Api.Endpoints;

// FR1/Section 19 step 1 — business signup and login. Unauthenticated by design (nothing to
// authenticate against yet); every other /api/* endpoint requires the token issued here.
public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth");

        auth.MapPost("/signup", async (
            SignupRequest request, AiBusinessPlatformDbContext db, IPasswordHasher<BusinessUser> passwordHasher,
            IOptions<JwtOptions> jwtOptions, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.BusinessName) || string.IsNullOrWhiteSpace(request.OwnerName) ||
                string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest("businessName, ownerName, email, and password are required.");
            }

            // Pre-tenant lookup: no business/tenant is known yet at signup time.
            var emailTaken = await db.BusinessUsers.IgnoreQueryFilters().AnyAsync(u => u.Email == request.Email, ct);
            if (emailTaken)
            {
                return Results.Conflict("An account with this email already exists.");
            }

            var business = new Business
            {
                Id = Guid.NewGuid(),
                Name = request.BusinessName,
                IndustryType = request.IndustryType,
                Status = BusinessStatus.Active,
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.Businesses.Add(business);

            var owner = new BusinessUser
            {
                Id = Guid.NewGuid(),
                BusinessId = business.Id,
                Name = request.OwnerName,
                Email = request.Email,
                Role = BusinessUserRole.Owner,
                CreatedAt = DateTimeOffset.UtcNow
            };
            owner.PasswordHash = passwordHasher.HashPassword(owner, request.Password);
            db.BusinessUsers.Add(owner);

            await db.SaveChangesAsync(ct);

            return Results.Ok(IssueToken(owner, jwtOptions.Value));
        });

        auth.MapPost("/login", async (
            LoginRequest request, AiBusinessPlatformDbContext db, IPasswordHasher<BusinessUser> passwordHasher,
            IOptions<JwtOptions> jwtOptions, CancellationToken ct) =>
        {
            // Pre-tenant lookup: which business this belongs to is exactly what we're resolving.
            var user = await db.BusinessUsers.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == request.Email, ct);
            if (user is null || !user.IsActive)
            {
                // Deliberately the same message regardless of which check failed (no account,
                // deactivated staff, wrong password) — don't reveal whether the email exists at all.
                return Results.Json(new { message = "Invalid email or password." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (verification == PasswordVerificationResult.Failed)
            {
                return Results.Json(new { message = "Invalid email or password." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            return Results.Ok(IssueToken(user, jwtOptions.Value));
        });

        // Completes StaffTools.InviteStaffAsync's pending invite — no session required, same as
        // signup/login, since the invitee has no account yet to authenticate with.
        auth.MapPost("/accept-invite", async (
            AcceptInviteRequest request, AiBusinessPlatformDbContext db, IPasswordHasher<BusinessUser> passwordHasher,
            IOptions<JwtOptions> jwtOptions, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest("token and password are required.");
            }

            var user = await db.BusinessUsers.IgnoreQueryFilters()
                .FirstOrDefaultAsync(u => u.InvitationToken == request.Token, ct);
            if (user is null || user.IsActive)
            {
                return Results.BadRequest("This invite code is invalid.");
            }
            if (user.InvitationExpiresAt is null || user.InvitationExpiresAt < DateTimeOffset.UtcNow)
            {
                return Results.BadRequest("This invite code has expired. Ask the business owner to resend it.");
            }

            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
            user.IsActive = true;
            user.InvitationToken = null;
            user.InvitationExpiresAt = null;
            await db.SaveChangesAsync(ct);

            return Results.Ok(IssueToken(user, jwtOptions.Value));
        });
    }

    private static AuthResponse IssueToken(BusinessUser user, JwtOptions options)
    {
        var tokenString = BusinessJwtTokenFactory.CreateAccessToken(user, options);
        return new AuthResponse(tokenString, user.BusinessId, user.Id, user.Role.ToString());
    }
}
