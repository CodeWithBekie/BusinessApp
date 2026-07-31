using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Auth;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AiBusinessPlatform.Api.Endpoints;

// Marketplace customer signup/login — mirrors AuthEndpoints.cs's shape exactly, but issues a
// deliberately different claim set (customer_account_id, no business_id/role) so a customer token
// can never be mistaken for tenant access. CustomerAccount carries no tenant query filter (it
// isn't ITenantScoped), so lookups here need no IgnoreQueryFilters() the way AuthEndpoints' own
// pre-tenant BusinessUser lookups do.
public static class CustomerAuthEndpoints
{
    public static void MapCustomerAuthEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/customer/auth");

        auth.MapPost("/signup", async (
            CustomerSignupRequest request, AiBusinessPlatformDbContext db, IPasswordHasher<CustomerAccount> passwordHasher,
            IOptions<JwtOptions> jwtOptions, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest("email and password are required.");
            }

            var emailTaken = await db.CustomerAccounts.AnyAsync(a => a.Email == request.Email, ct);
            if (emailTaken)
            {
                return Results.Conflict("An account with this email already exists.");
            }

            var account = new CustomerAccount
            {
                Id = Guid.NewGuid(),
                Email = request.Email,
                Name = request.Name,
                PhoneNumber = request.PhoneNumber,
                CreatedAt = DateTimeOffset.UtcNow
            };
            account.PasswordHash = passwordHasher.HashPassword(account, request.Password);
            db.CustomerAccounts.Add(account);

            await db.SaveChangesAsync(ct);

            return Results.Ok(IssueToken(account, jwtOptions.Value));
        });

        auth.MapPost("/login", async (
            CustomerLoginRequest request, AiBusinessPlatformDbContext db, IPasswordHasher<CustomerAccount> passwordHasher,
            IOptions<JwtOptions> jwtOptions, CancellationToken ct) =>
        {
            var account = await db.CustomerAccounts.FirstOrDefaultAsync(a => a.Email == request.Email, ct);
            if (account is null)
            {
                return Results.Json(new { message = "Invalid email or password." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var verification = passwordHasher.VerifyHashedPassword(account, account.PasswordHash, request.Password);
            if (verification == PasswordVerificationResult.Failed)
            {
                // Deliberately the same message as the "no account" branch above — don't reveal
                // whether the email exists at all.
                return Results.Json(new { message = "Invalid email or password." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            return Results.Ok(IssueToken(account, jwtOptions.Value));
        });
    }

    private static CustomerAuthResponse IssueToken(CustomerAccount account, JwtOptions options)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, account.Id.ToString()),
            new Claim("customer_account_id", account.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, account.Email)
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
        return new CustomerAuthResponse(tokenString, account.Id, account.Email, account.Name);
    }
}
