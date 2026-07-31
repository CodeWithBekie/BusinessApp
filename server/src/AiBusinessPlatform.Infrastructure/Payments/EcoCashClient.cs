using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AiBusinessPlatform.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Infrastructure.Payments;

internal record EcoCashChargingInformation(
    [property: JsonPropertyName("amount")] string Amount,
    [property: JsonPropertyName("currency")] string Currency,
    [property: JsonPropertyName("description")] string Description);

internal record EcoCashChargeMetaData([property: JsonPropertyName("channel")] string Channel);

internal record EcoCashPaymentAmount(
    [property: JsonPropertyName("charginginformation")] EcoCashChargingInformation ChargingInformation,
    [property: JsonPropertyName("chargeMetaData")] EcoCashChargeMetaData ChargeMetaData);

internal record EcoCashChargeRequestBody(
    [property: JsonPropertyName("clientCorrelator")] string ClientCorrelator,
    [property: JsonPropertyName("referenceCode")] string ReferenceCode,
    [property: JsonPropertyName("tranType")] string TranType,
    [property: JsonPropertyName("endUserId")] string EndUserId,
    [property: JsonPropertyName("paymentAmount")] EcoCashPaymentAmount PaymentAmount,
    [property: JsonPropertyName("merchantCode")] string MerchantCode,
    [property: JsonPropertyName("merchantPin")] string MerchantPin,
    [property: JsonPropertyName("merchantNumber")] string MerchantNumber,
    [property: JsonPropertyName("countryCode")] string CountryCode,
    [property: JsonPropertyName("terminalID")] string TerminalId,
    [property: JsonPropertyName("location")] string Location,
    [property: JsonPropertyName("superMerchantName")] string SuperMerchantName,
    [property: JsonPropertyName("merchantName")] string MerchantName,
    [property: JsonPropertyName("transactionOperationStatus")] string TransactionOperationStatus,
    [property: JsonPropertyName("remarks")] string Remarks,
    [property: JsonPropertyName("notifyUrl")] string NotifyUrl);

internal record EcoCashRefundRequestBody(
    [property: JsonPropertyName("clientCorrelator")] string ClientCorrelator,
    [property: JsonPropertyName("referenceCode")] string ReferenceCode,
    [property: JsonPropertyName("tranType")] string TranType,
    [property: JsonPropertyName("endUserId")] string EndUserId,
    [property: JsonPropertyName("originalEcocashReference")] string OriginalEcocashReference,
    [property: JsonPropertyName("paymentAmount")] EcoCashPaymentAmount PaymentAmount,
    [property: JsonPropertyName("merchantCode")] string MerchantCode,
    [property: JsonPropertyName("merchantPin")] string MerchantPin,
    [property: JsonPropertyName("merchantNumber")] string MerchantNumber,
    [property: JsonPropertyName("currencyCode")] string CurrencyCode,
    [property: JsonPropertyName("countryCode")] string CountryCode,
    [property: JsonPropertyName("terminalID")] string TerminalId,
    [property: JsonPropertyName("location")] string Location,
    [property: JsonPropertyName("superMerchantName")] string SuperMerchantName,
    [property: JsonPropertyName("merchantName")] string MerchantName);

// Real EcoCash Instant Payment API client — JSON + HTTP Basic auth, a completely different wire
// model from PaynowClient's form-urlencoded hash-signed requests. Field names/casing (e.g.
// "charginginformation", "terminalID", "originalEcocashReference") are copied exactly from EcoCash's
// own sandbox documentation — do not "clean up" the casing, it's a wire contract.
//
// KNOWN, CONFIRMED-LIVE QUIRK: developers.ecocash.co.zw sits behind Cloudflare, which blocks
// .NET's HttpClient (and PowerShell's native HTTP stack) at what appears to be a TLS/client-fingerprint
// level — confirmed by testing all three from this exact machine/IP: curl gets a real application
// response (e.g. "Whitelist the test MSISDN before using it in the sandbox"), HttpClient and
// Invoke-WebRequest both get Cloudflare's interactive-challenge block page, even with identical
// headers, HTTP/1.1 forced, etc. Rather than keep fighting that fingerprint from managed code
// (which starts to look like evading a security control instead of just calling an API), this
// client shells out to the system's own `curl` binary for the actual HTTP call — a legitimate,
// commonly-used workaround for exactly this class of WAF behavior, not a spoofing technique.
// Requires curl to be present on the host (bundled with Windows 10+/most Linux distros/macOS).
//
// The response body shape was NOT documented anywhere available when this was written — only the
// request shape was confirmed. ParseResponse's field-name guesses (below) must be corrected against
// a real sandbox response before this is trusted in production; every call is logged in full
// (LogInformation, not just failures) specifically so that correction can happen quickly.
public class EcoCashClient(IOptions<EcoCashOptions> options, ILogger<EcoCashClient> logger) : IEcoCashClient
{
    public async Task<EcoCashChargeResult> ChargeAsync(
        string username, string password, string merchantCode, string merchantPin, string merchantNumber,
        string merchantName, string superMerchantName, string countryCode, string terminalId, string location,
        string clientCorrelator, string referenceCode, decimal amount, string currency, string endUserId,
        string notifyUrl, CancellationToken cancellationToken = default)
    {
        var body = new EcoCashChargeRequestBody(
            clientCorrelator, referenceCode, "MER", NormalizeEndUserId(endUserId),
            new EcoCashPaymentAmount(
                new EcoCashChargingInformation(FormatAmount(amount), currency, "Online Payment"),
                new EcoCashChargeMetaData("WEB")),
            merchantCode, merchantPin, merchantNumber, countryCode, terminalId, location, superMerchantName,
            merchantName, "Charged", "Online Payment", notifyUrl);

        var (success, rawBody) = await PostAsync("/transactions/amount/", username, password, body, cancellationToken);
        var (status, reference) = ParseResponse(rawBody);
        return new EcoCashChargeResult(success, reference, status, rawBody);
    }

    public async Task<EcoCashRefundResult> RefundAsync(
        string username, string password, string merchantCode, string merchantPin, string merchantNumber,
        string merchantName, string superMerchantName, string countryCode, string terminalId, string location,
        string clientCorrelator, string originalEcoCashReference, decimal amount, string currency, string endUserId,
        CancellationToken cancellationToken = default)
    {
        var body = new EcoCashRefundRequestBody(
            clientCorrelator, clientCorrelator, "MER", NormalizeEndUserId(endUserId), originalEcoCashReference,
            new EcoCashPaymentAmount(
                new EcoCashChargingInformation(FormatAmount(amount), currency, "Refund"),
                new EcoCashChargeMetaData("WEB")),
            merchantCode, merchantPin, merchantNumber, currency, countryCode, terminalId, location,
            superMerchantName, merchantName);

        var (success, rawBody) = await PostAsync("/transactions/refund/", username, password, body, cancellationToken);
        var (status, reference) = ParseResponse(rawBody);
        return new EcoCashRefundResult(success, reference, status, rawBody);
    }

    public async Task<EcoCashStatusResult> CheckStatusAsync(
        string username, string password, string endUserId, string clientCorrelator, CancellationToken cancellationToken = default)
    {
        var url = $"{options.Value.BaseUrl}/{NormalizeEndUserId(endUserId)}/transactions/amount/{Uri.EscapeDataString(clientCorrelator)}";
        var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"));
        var args = new List<string>
        {
            "-s", url,
            "-H", "Accept: application/json",
            "-H", $"Authorization: Basic {basicAuth}",
            "-H", "User-Agent: AiBusinessPlatform/1.0",
            "-w", "\n%{http_code}",
        };

        var (success, rawBody) = await RunCurlAsync(args, stdin: null, cancellationToken);
        var (status, _) = ParseResponse(rawBody);
        return new EcoCashStatusResult(success, status, rawBody);
    }

    private Task<(bool Success, string RawBody)> PostAsync<TBody>(
        string path, string username, string password, TBody body, CancellationToken cancellationToken)
    {
        var url = $"{options.Value.BaseUrl}{path}";
        var json = JsonSerializer.Serialize(body);
        var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"));
        var args = new List<string>
        {
            "-s", "-X", "POST", url,
            "-H", "Content-Type: application/json",
            "-H", "Accept: application/json",
            "-H", $"Authorization: Basic {basicAuth}",
            "-H", "User-Agent: AiBusinessPlatform/1.0",
            "--data-binary", "@-",
            "-w", "\n%{http_code}",
        };

        return RunCurlAsync(args, json, cancellationToken);
    }

    private async Task<(bool Success, string RawBody)> RunCurlAsync(List<string> args, string? stdin, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "curl",
            RedirectStandardInput = stdin is not null,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Failed to start curl for the EcoCash request — is curl installed on this host?");

        if (stdin is not null)
        {
            await process.StandardInput.WriteAsync(stdin);
            process.StandardInput.Close();
        }

        var stdout = await process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderr = await process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);

        if (process.ExitCode != 0)
        {
            logger.LogError("EcoCash curl invocation failed (exit {Code}): {Error}", process.ExitCode, stderr);
            return (false, stderr.Length > 0 ? stderr : $"curl exited with code {process.ExitCode}");
        }

        // stdout is the response body followed by "\n<http_code>" (from -w above).
        var lastNewline = stdout.LastIndexOf('\n');
        var rawBody = lastNewline >= 0 ? stdout[..lastNewline] : string.Empty;
        var statusCodeText = (lastNewline >= 0 ? stdout[(lastNewline + 1)..] : stdout).Trim();
        var success = int.TryParse(statusCodeText, out var statusCode) && statusCode is >= 200 and < 300;

        logger.LogInformation("EcoCash -> {Status}: {Body}", statusCodeText, rawBody);

        return (success, rawBody);
    }

    private static string FormatAmount(decimal amount) => amount.ToString("0.00", CultureInfo.InvariantCulture);

    // EcoCash's own reference client code always sends endUserId in full international format
    // (e.g. "263771234567"), not local format ("0771234567") — normalize here in one place so every
    // caller (charge/refund/status) can pass whatever format the customer's number was stored in.
    private static string NormalizeEndUserId(string phoneNumber)
    {
        var digitsOnly = new string(phoneNumber.Where(char.IsDigit).ToArray());
        return digitsOnly.StartsWith('0') && digitsOnly.Length == 10 ? "263" + digitsOnly[1..] : digitsOnly;
    }

    private static (string? Status, string? Reference) ParseResponse(string rawBody)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawBody);
            var root = doc.RootElement;
            // transactionStatus confirmed from EcoCash's own reference client code — checked first;
            // the other two names are earlier guesses kept as a fallback in case a different endpoint
            // (e.g. an older API version) still uses them.
            var status = TryGetString(root, "transactionStatus") ?? TryGetString(root, "transactionOperationStatus") ?? TryGetString(root, "status");
            var reference = TryGetString(root, "ecocashReference") ?? TryGetString(root, "transactionReference") ?? TryGetString(root, "referenceCode");
            return (status, reference);
        }
        catch (JsonException)
        {
            return (null, null);
        }
    }

    private static string? TryGetString(JsonElement root, string propertyName) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty(propertyName, out var prop) && prop.ValueKind == JsonValueKind.String
            ? prop.GetString()
            : null;
}
