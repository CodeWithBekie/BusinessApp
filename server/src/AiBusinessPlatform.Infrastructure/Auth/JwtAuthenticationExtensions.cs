using System.Text;
using AiBusinessPlatform.Application.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace AiBusinessPlatform.Infrastructure.Auth;

// Shared between the Api project (issues tokens) and the Mcp project (validates them, so an MCP
// tool call authenticates as the same business the caller is already logged in as) — duplicating
// this setup in both Program.cs files would risk the two silently drifting apart.
public static class JwtAuthenticationExtensions
{
    public static IServiceCollection AddPlatformJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));

        var jwtOptions = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
            ?? throw new InvalidOperationException("Jwt configuration section is missing.");
        if (string.IsNullOrWhiteSpace(jwtOptions.SigningKey))
        {
            throw new InvalidOperationException("Jwt:SigningKey is not configured (dotnet user-secrets).");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Without this, the handler remaps short JWT claim names (e.g. "sub") to legacy
                // long-form URIs on the way in (JwtSecurityTokenHandler.DefaultInboundClaimTypeMap)
                // — so a claim issued as "sub" is no longer findable via that same name once the
                // principal is built.
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwtOptions.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwtOptions.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1)
                };
            });

        // Turns a wrong-token-type call (a business token hitting a customer-only marketplace
        // route, or vice versa) into a clean 403 at the framework level, rather than relying on
        // every endpoint author to manually check ICurrentCustomerProvider/ICurrentTenantProvider
        // for null/throw.
        services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();

        services.AddAuthorization(options =>
        {
            options.AddPolicy("CustomerOnly", policy => policy.RequireClaim("customer_account_id"));
            options.AddPolicy("BusinessOnly", policy => policy.RequireClaim("business_id"));

            // One policy per Permission — endpoints/tool gates opt in via
            // .RequireAuthorization("BusinessOnly", $"Permission:{permission}"); both policy
            // names must pass (AND), so a permission failure never accidentally also grants
            // cross-tenant/customer access.
            foreach (var permission in Enum.GetValues<Permission>())
            {
                options.AddPolicy($"Permission:{permission}", policy => policy.Requirements.Add(new PermissionRequirement(permission)));
            }
        });

        return services;
    }
}
