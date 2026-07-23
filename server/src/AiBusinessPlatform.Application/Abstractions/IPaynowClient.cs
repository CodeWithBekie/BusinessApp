namespace AiBusinessPlatform.Application.Abstractions;

public record PaynowInitResult(bool Success, string? Error, string? PollUrl, string? Instructions);

public record PaynowStatusResult(string Status, string? PaynowReference, decimal Amount);

// Section 13.2 — real outbound calls to Paynow's Express Checkout (mobile money) API. Wire format
// and hash algorithm are documented in AiBusinessPlatform.Application.Payments.
public interface IPaynowClient
{
    Task<PaynowInitResult> InitiateMobileTransactionAsync(
        string integrationId, string integrationKey, string reference, decimal amount, string additionalInfo,
        string authEmail, string phone, string method, string resultUrl, string returnUrl,
        CancellationToken cancellationToken = default);

    Task<PaynowStatusResult> PollTransactionAsync(string pollUrl, string integrationKey, CancellationToken cancellationToken = default);
}
