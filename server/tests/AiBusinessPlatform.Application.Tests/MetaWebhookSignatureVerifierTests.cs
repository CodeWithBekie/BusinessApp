using System.Security.Cryptography;
using System.Text;
using AiBusinessPlatform.Application.WhatsApp;

namespace AiBusinessPlatform.Application.Tests;

public class MetaWebhookSignatureVerifierTests
{
    private const string AppSecret = "test-app-secret";

    // Computed independently of MetaWebhookSignatureVerifier's own implementation, so a bug in
    // both wouldn't accidentally cancel out.
    private static string ComputeSignatureHeader(string body, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body));
        return "sha256=" + Convert.ToHexString(hash).ToLowerInvariant();
    }

    [Fact]
    public void IsValid_returns_true_for_a_correctly_signed_body()
    {
        var body = "{\"object\":\"whatsapp_business_account\"}";
        var signature = ComputeSignatureHeader(body, AppSecret);

        var result = MetaWebhookSignatureVerifier.IsValid(Encoding.UTF8.GetBytes(body), signature, AppSecret);

        Assert.True(result);
    }

    [Fact]
    public void IsValid_returns_false_when_the_body_was_tampered_with_after_signing()
    {
        var originalBody = "{\"object\":\"whatsapp_business_account\"}";
        var signature = ComputeSignatureHeader(originalBody, AppSecret);
        var tamperedBody = "{\"object\":\"whatsapp_business_account\",\"extra\":true}";

        var result = MetaWebhookSignatureVerifier.IsValid(Encoding.UTF8.GetBytes(tamperedBody), signature, AppSecret);

        Assert.False(result);
    }

    [Fact]
    public void IsValid_returns_false_when_signed_with_the_wrong_secret()
    {
        var body = "{\"object\":\"whatsapp_business_account\"}";
        var signature = ComputeSignatureHeader(body, "a-different-secret");

        var result = MetaWebhookSignatureVerifier.IsValid(Encoding.UTF8.GetBytes(body), signature, AppSecret);

        Assert.False(result);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-valid-signature-header")]
    [InlineData("sha256=not-valid-hex-zzzz")]
    public void IsValid_returns_false_for_missing_or_malformed_signature_headers(string? signatureHeader)
    {
        var body = "{\"object\":\"whatsapp_business_account\"}";

        var result = MetaWebhookSignatureVerifier.IsValid(Encoding.UTF8.GetBytes(body), signatureHeader, AppSecret);

        Assert.False(result);
    }

    [Fact]
    public void IsValid_returns_false_when_app_secret_is_empty()
    {
        var body = "{\"object\":\"whatsapp_business_account\"}";
        var signature = ComputeSignatureHeader(body, AppSecret);

        var result = MetaWebhookSignatureVerifier.IsValid(Encoding.UTF8.GetBytes(body), signature, string.Empty);

        Assert.False(result);
    }
}
