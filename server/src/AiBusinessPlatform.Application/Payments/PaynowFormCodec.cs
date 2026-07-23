using System.Net;

namespace AiBusinessPlatform.Application.Payments;

// Paynow's wire format is application/x-www-form-urlencoded on BOTH the outbound initiate-
// transaction request and every inbound response/webhook callback — not JSON. Field ORDER matters
// for hash verification (Section 13.2/PaynowHashUtil), so parsing is done by hand rather than via
// a keyed collection (e.g. IFormCollection) that doesn't guarantee it preserves wire order.
public static class PaynowFormCodec
{
    public static IReadOnlyList<KeyValuePair<string, string>> ParseOrdered(string rawBody)
    {
        var result = new List<KeyValuePair<string, string>>();
        if (string.IsNullOrEmpty(rawBody))
        {
            return result;
        }

        foreach (var pair in rawBody.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separatorIndex = pair.IndexOf('=');
            var key = separatorIndex >= 0 ? pair[..separatorIndex] : pair;
            var value = separatorIndex >= 0 ? pair[(separatorIndex + 1)..] : string.Empty;

            result.Add(new KeyValuePair<string, string>(WebUtility.UrlDecode(key), WebUtility.UrlDecode(value)));
        }

        return result;
    }

    public static string Encode(IReadOnlyList<KeyValuePair<string, string>> fields) =>
        string.Join('&', fields.Select(f => $"{WebUtility.UrlEncode(f.Key)}={WebUtility.UrlEncode(f.Value)}"));
}
