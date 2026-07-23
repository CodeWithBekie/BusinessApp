using System.Security.Cryptography;
using System.Text;
using AiBusinessPlatform.Application.Payments;

namespace AiBusinessPlatform.Application.Tests;

public class PaynowHashUtilTests
{
    private const string IntegrationKey = "test-integration-key";

    private static List<KeyValuePair<string, string>> SampleFields() =>
    [
        new("resulturl", "https://example.test/webhooks/payments/paynow"),
        new("returnurl", "https://example.test/return"),
        new("reference", "INV-ABC123"),
        new("amount", "12.50"),
        new("id", "1234"),
        new("additionalinfo", "Cement, Claw Hammer"),
        new("authemail", "owner@example.test"),
        new("status", "Message"),
        new("phone", "263771234567"),
        new("method", "ecocash")
    ];

    // Computed independently of PaynowHashUtil's own implementation: concatenate values in order,
    // append the lowercased key, SHA512, uppercase hex — matching Paynow's own PHP SDK algorithm,
    // not by calling the code under test.
    private static string ExpectedHash(IEnumerable<KeyValuePair<string, string>> fields, string key)
    {
        var input = string.Concat(fields.Select(f => f.Value)) + key.ToLowerInvariant();
        var hash = SHA512.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash);
    }

    [Fact]
    public void ComputeHash_matches_independently_computed_value()
    {
        var fields = SampleFields();

        var result = PaynowHashUtil.ComputeHash(fields, IntegrationKey);

        Assert.Equal(ExpectedHash(fields, IntegrationKey), result);
    }

    [Fact]
    public void ComputeHash_skips_a_field_literally_named_hash_case_insensitively()
    {
        var fields = SampleFields();
        var withHash = new List<KeyValuePair<string, string>>(fields) { new("HASH", "ignored-value") };

        var result = PaynowHashUtil.ComputeHash(withHash, IntegrationKey);

        Assert.Equal(ExpectedHash(fields, IntegrationKey), result);
    }

    [Fact]
    public void Verify_returns_true_when_the_hash_field_matches()
    {
        var fields = SampleFields();
        var hash = ExpectedHash(fields, IntegrationKey);
        var withHash = new List<KeyValuePair<string, string>>(fields) { new("hash", hash) };

        Assert.True(PaynowHashUtil.Verify(withHash, IntegrationKey));
    }

    [Fact]
    public void Verify_returns_false_when_a_value_was_tampered_with_after_signing()
    {
        var fields = SampleFields();
        var hash = ExpectedHash(fields, IntegrationKey);

        var tampered = new List<KeyValuePair<string, string>>(fields) { new("hash", hash) };
        tampered[3] = new KeyValuePair<string, string>("amount", "999.99"); // was 12.50

        Assert.False(PaynowHashUtil.Verify(tampered, IntegrationKey));
    }

    [Fact]
    public void Verify_returns_false_when_signed_with_the_wrong_key()
    {
        var fields = SampleFields();
        var hash = ExpectedHash(fields, "a-different-key");
        var withHash = new List<KeyValuePair<string, string>>(fields) { new("hash", hash) };

        Assert.False(PaynowHashUtil.Verify(withHash, IntegrationKey));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-valid-hex-zzzz")]
    public void Verify_returns_false_for_missing_or_malformed_hash(string hashValue)
    {
        var fields = SampleFields();
        var withHash = new List<KeyValuePair<string, string>>(fields) { new("hash", hashValue) };

        Assert.False(PaynowHashUtil.Verify(withHash, IntegrationKey));
    }
}
