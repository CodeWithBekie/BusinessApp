using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AiBusinessPlatform.Api.Auth;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

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
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (verification == PasswordVerificationResult.Failed)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(IssueToken(user, jwtOptions.Value));
        });
    }

    private static AuthResponse IssueToken(BusinessUser user, JwtOptions options)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim("business_id", user.BusinessId.ToString()),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email)
        };

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(options.ExpiryMinutes),
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        return new AuthResponse(tokenString, user.BusinessId, user.Id, user.Role.ToString());
    }
}
