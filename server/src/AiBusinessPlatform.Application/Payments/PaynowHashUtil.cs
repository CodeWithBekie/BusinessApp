using System.Security.Cryptography;
using System.Text;

namespace AiBusinessPlatform.Application.Payments;

// Section 13.2 — Paynow's hash algorithm, confirmed from Paynow's own official PHP SDK source
// (Paynow-PHP-SDK/src/Util/Hash.php — developers.paynow.co.zw itself blocks automated fetches).
// Concatenate every field's VALUE (not key), in the exact order the fields appear on the wire,
// skipping only a field literally named "hash" (case-insensitive); append the integration key
// (lowercased); SHA512; uppercase hex. Used both to sign our own outbound requests and to verify
// Paynow's own responses/webhook callbacks.
public static class PaynowHashUtil
{
    public static string ComputeHash(IEnumerable<KeyValuePair<string, string>> orderedFields, string integrationKey)
    {
        var builder = new StringBuilder();
        foreach (var (key, value) in orderedFields)
        {
            if (string.Equals(key, "hash", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            builder.Append(value);
        }

        builder.Append(integrationKey.ToLowerInvariant());

        var hash = SHA512.HashData(Encoding.UTF8.GetBytes(builder.ToString()));
        return Convert.ToHexString(hash); // Convert.ToHexString already returns uppercase.
    }

    // Verifies a "hash" field present among orderedFields against a freshly computed one, using a
    // constant-time comparison — same shape as MetaWebhookSignatureVerifier.
    public static bool Verify(IReadOnlyList<KeyValuePair<string, string>> orderedFields, string integrationKey)
    {
        var sentHash = orderedFields.FirstOrDefault(f => string.Equals(f.Key, "hash", StringComparison.OrdinalIgnoreCase)).Value;
        if (string.IsNullOrEmpty(sentHash))
        {
            return false;
        }

        byte[] sentBytes;
        try
        {
            sentBytes = Convert.FromHexString(sentHash);
        }
        catch (FormatException)
        {
            return false;
        }

        var expectedHex = ComputeHash(orderedFields, integrationKey);
        byte[] expectedBytes;
        try
        {
            expectedBytes = Convert.FromHexString(expectedHex);
        }
        catch (FormatException)
        {
            return false;
        }

        if (sentBytes.Length != expectedBytes.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(sentBytes, expectedBytes);
    }
}
