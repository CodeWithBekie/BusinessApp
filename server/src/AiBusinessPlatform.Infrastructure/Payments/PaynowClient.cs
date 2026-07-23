using System.Globalization;
using System.Net.Http.Headers;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Payments;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Infrastructure.Payments;

// Section 13.2 — real calls to Paynow's Express Checkout (mobile money) API. Field order, hash
// algorithm, and the form-urlencoded wire format are all confirmed from Paynow's own official PHP
// SDK source (Paynow-PHP-SDK), since developers.paynow.co.zw itself blocks automated fetches.
public class PaynowClient(HttpClient httpClient, IOptions<PaynowOptions> options, ILogger<PaynowClient> logger) : IPaynowClient
{
    public async Task<PaynowInitResult> InitiateMobileTransactionAsync(
        string integrationId, string integrationKey, string reference, decimal amount, string additionalInfo,
        string authEmail, string phone, string method, string resultUrl, string returnUrl,
        CancellationToken cancellationToken = default)
    {
        // Order matches FluentBuilder::toArray() + formatInitMobile()'s overrides in the reference
        // PHP SDK exactly — the hash is computed over this same order, so it can't be reshuffled
        // for readability.
        var fields = new List<KeyValuePair<string, string>>
        {
            new("resulturl", resultUrl),
            new("returnurl", returnUrl),
            new("reference", reference),
            new("amount", amount.ToString("0.00", CultureInfo.InvariantCulture)),
            new("id", integrationId),
            new("additionalinfo", additionalInfo),
            new("authemail", authEmail),
            new("status", "Message"),
            new("phone", phone),
            new("method", method)
        };

        var hash = PaynowHashUtil.ComputeHash(fields, integrationKey);
        fields.Add(new KeyValuePair<string, string>("hash", hash));

        var body = PaynowFormCodec.Encode(fields);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{options.Value.BaseUrl}/interface/remotetransaction")
        {
            Content = new StringContent(body)
        };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/x-www-form-urlencoded");

        var response = await httpClient.SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Paynow initiate transaction failed ({Status}): {Body}", response.StatusCode, responseBody);
            throw new PaynowRequestException($"Paynow returned {response.StatusCode}", responseBody);
        }

        var responseFields = PaynowFormCodec.ParseOrdered(responseBody);
        if (responseFields.Any(f => string.Equals(f.Key, "hash", StringComparison.OrdinalIgnoreCase)) &&
            !PaynowHashUtil.Verify(responseFields, integrationKey))
        {
            logger.LogError("Paynow initiate transaction response failed hash verification.");
            throw new PaynowRequestException("Paynow response failed hash verification.", responseBody);
        }

        var status = GetField(responseFields, "status");
        var success = string.Equals(status, "ok", StringComparison.OrdinalIgnoreCase);
        var error = GetField(responseFields, "error");
        var pollUrl = GetField(responseFields, "pollurl");
        var instructions = GetField(responseFields, "instructions");

        return new PaynowInitResult(success, error, pollUrl, instructions);
    }

    public async Task<PaynowStatusResult> PollTransactionAsync(string pollUrl, string integrationKey, CancellationToken cancellationToken = default)
    {
        var response = await httpClient.GetAsync(pollUrl, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Paynow poll transaction failed ({Status}): {Body}", response.StatusCode, responseBody);
            throw new PaynowRequestException($"Paynow returned {response.StatusCode}", responseBody);
        }

        var responseFields = PaynowFormCodec.ParseOrdered(responseBody);
        if (responseFields.Any(f => string.Equals(f.Key, "hash", StringComparison.OrdinalIgnoreCase)) &&
            !PaynowHashUtil.Verify(responseFields, integrationKey))
        {
            logger.LogError("Paynow poll transaction response failed hash verification.");
            throw new PaynowRequestException("Paynow response failed hash verification.", responseBody);
        }

        var status = GetField(responseFields, "status") ?? "Unavailable";
        var paynowReference = GetField(responseFields, "paynowreference");
        var amountText = GetField(responseFields, "amount");
        var amount = decimal.TryParse(amountText, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsedAmount)
            ? parsedAmount
            : -1m;

        return new PaynowStatusResult(status, paynowReference, amount);
    }

    private static string? GetField(IReadOnlyList<KeyValuePair<string, string>> fields, string key) =>
        fields.FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase)).Value;
}
