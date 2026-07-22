using System.Security.Cryptography;
using System.Text;

namespace AiBusinessPlatform.Application.WhatsApp;

// Section 9.3/15 — Meta signs every webhook delivery with HMAC-SHA256 over the raw request body,
// using the app's single App Secret (App Dashboard > Settings > Basic — not per-WhatsAppConnection;
// there is no business-identifying information in this handshake at all). Verify against the raw
// bytes BEFORE any JSON deserialization.
public static class MetaWebhookSignatureVerifier
{
    private const string SignaturePrefix = "sha256=";

    public static bool IsValid(ReadOnlySpan<byte> rawBody, string? signatureHeader, string appSecret)
    {
        if (string.IsNullOrEmpty(signatureHeader) || !signatureHeader.StartsWith(SignaturePrefix, StringComparison.Ordinal))
        {
            return false;
        }

        if (string.IsNullOrEmpty(appSecret))
        {
            return false;
        }

        var expectedHex = signatureHeader[SignaturePrefix.Length..];

        byte[] expected;
        try
        {
            expected = Convert.FromHexString(expectedHex);
        }
        catch (FormatException)
        {
            return false;
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
        var computed = hmac.ComputeHash(rawBody.ToArray());

        if (expected.Length != computed.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(computed, expected);
    }
}
