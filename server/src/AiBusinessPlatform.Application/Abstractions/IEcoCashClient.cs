namespace AiBusinessPlatform.Application.Abstractions;

// RawResponse is kept on every result deliberately for the same reason PaynowRequestException keeps
// ResponseBody — inspecting the raw body is the fastest way to catch a wire-shape mismatch. Status
// field name (transactionStatus) is confirmed from EcoCash's own reference client code; Success is
// still inferred from the HTTP status since a definitive success/failure enum value wasn't shown.
public record EcoCashChargeResult(bool Success, string? EcoCashReference, string? Status, string? RawResponse);

public record EcoCashRefundResult(bool Success, string? EcoCashReference, string? Status, string? RawResponse);

public record EcoCashStatusResult(bool Success, string? Status, string? RawResponse);

// Real outbound calls to EcoCash's own Instant Payment API (developers.ecocash.co.zw) — a genuine
// alternate gateway to IPaynowClient's Paynow-mediated "ecocash" method, not a replacement for it.
public interface IEcoCashClient
{
    Task<EcoCashChargeResult> ChargeAsync(
        string username, string password, string merchantCode, string merchantPin, string merchantNumber,
        string merchantName, string superMerchantName, string countryCode, string terminalId, string location,
        string clientCorrelator, string referenceCode, decimal amount, string currency, string endUserId,
        string notifyUrl, CancellationToken cancellationToken = default);

    Task<EcoCashRefundResult> RefundAsync(
        string username, string password, string merchantCode, string merchantPin, string merchantNumber,
        string merchantName, string superMerchantName, string countryCode, string terminalId, string location,
        string clientCorrelator, string originalEcoCashReference, decimal amount, string currency, string endUserId,
        CancellationToken cancellationToken = default);

    // GET /{endUserId}/transactions/amount/{clientCorrelator} — confirmed real endpoint (was
    // undocumented/assumed-absent when this client was first built). clientCorrelator here is the
    // same value originally sent as both clientCorrelator and referenceCode on the charge — this
    // system stores that single value as Payment.ProviderReference.
    Task<EcoCashStatusResult> CheckStatusAsync(
        string username, string password, string endUserId, string clientCorrelator, CancellationToken cancellationToken = default);
}
