using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Payments;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Infrastructure.Tools;

// Section 13.2 — real Paynow Express Checkout (mobile money) integration. Never AI-facing itself;
// called by OrderTools.CreateInvoiceAsync, which IS reachable from the orchestrator via create_invoice.
public class PaymentTools(
    AiBusinessPlatformDbContext dbContext,
    ICurrentTenantProvider tenantProvider,
    IPaynowClient paynowClient,
    IOptions<PaynowOptions> paynowOptions,
    IEcoCashClient ecoCashClient,
    IOptions<EcoCashOptions> ecoCashOptions) : IPaymentTools
{
    public async Task<PaymentRequestResult> CreatePaymentRequestAsync(
        Guid businessId, Guid orderId, decimal amount, string currency, string customerNumber, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var reference = $"INV-{orderId:N}"[..12].ToUpperInvariant();

        // EcoCash is checked first — it's the real, direct gateway; Paynow's own "ecocash" method
        // stays available as a fallback for businesses that connected it before this existed.
        var ecoCashConnection = await dbContext.EcoCashConnections.FirstOrDefaultAsync(c => c.BusinessId == businessId, cancellationToken);
        if (ecoCashConnection is not null)
        {
            var notifyUrl = $"{ecoCashOptions.Value.PublicBaseUrl}/webhooks/payments/ecocash";
            var charge = await ecoCashClient.ChargeAsync(
                ecoCashConnection.Username, ecoCashConnection.Password, ecoCashConnection.MerchantCode,
                ecoCashConnection.MerchantPin, ecoCashConnection.MerchantNumber, ecoCashConnection.MerchantName,
                ecoCashConnection.SuperMerchantName, ecoCashConnection.CountryCode, ecoCashConnection.TerminalId,
                ecoCashConnection.Location, clientCorrelator: reference, referenceCode: reference, amount, currency,
                endUserId: customerNumber, notifyUrl, cancellationToken);

            if (!charge.Success)
            {
                throw new InvalidOperationException($"EcoCash rejected the payment request: {charge.RawResponse}");
            }

            // No PollUrl — unlike Paynow's, EcoCash's status-check endpoint isn't a URL returned
            // from the charge call, it's built from endUserId + clientCorrelator (see
            // GetPaymentStatusAsync's own EcoCash branch, keyed off Payment.EcoCashEndUserId instead).
            return new PaymentRequestResult(reference, charge.Status, PollUrl: null);
        }

        var connection = await dbContext.PaynowConnections.FirstOrDefaultAsync(c => c.BusinessId == businessId, cancellationToken);
        if (connection is null)
        {
            // No Paynow connection configured yet — same manual/offline reference stand-in this
            // system always used before Paynow existed. A business can take orders before
            // completing payment onboarding (Section 19 step 4 comes after catalog setup, step 2).
            return new PaymentRequestResult(reference);
        }

        var resultUrl = $"{paynowOptions.Value.PublicBaseUrl}/webhooks/payments/paynow";
        var returnUrl = $"{paynowOptions.Value.PublicBaseUrl}/webhooks/payments/paynow/return";

        var init = await paynowClient.InitiateMobileTransactionAsync(
            connection.IntegrationId, connection.IntegrationKey, reference, amount,
            additionalInfo: $"Order {orderId}",
            authEmail: connection.NotificationEmail,
            phone: customerNumber,
            method: "ecocash",
            resultUrl: resultUrl,
            returnUrl: returnUrl,
            cancellationToken);

        if (!init.Success)
        {
            throw new InvalidOperationException($"Paynow rejected the payment request: {init.Error ?? "unknown error"}");
        }

        return new PaymentRequestResult(reference, init.Instructions, init.PollUrl);
    }

    public async Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentReference, CancellationToken cancellationToken = default)
    {
        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.ProviderReference == paymentReference, cancellationToken)
            ?? throw new InvalidOperationException($"No payment found with reference {paymentReference}.");

        // EcoCash has a real status-check endpoint (GET /{endUserId}/transactions/amount/{clientCorrelator},
        // confirmed from EcoCash's own reference client code) — check this before the PollUrl-based
        // Paynow branch below, since an EcoCash payment never has a PollUrl.
        if (payment.PollUrl is null && payment.EcoCashEndUserId is not null)
        {
            var ecoCashConnection = await dbContext.EcoCashConnections.FirstOrDefaultAsync(c => c.BusinessId == payment.BusinessId, cancellationToken)
                ?? throw new InvalidOperationException($"Payment {payment.Id} has an EcoCash end user id but its business has no EcoCashConnection.");

            var ecoCashStatus = await ecoCashClient.CheckStatusAsync(
                ecoCashConnection.Username, ecoCashConnection.Password, payment.EcoCashEndUserId, paymentReference, cancellationToken);

            return new PaymentStatusResult(paymentReference, ecoCashStatus.Status ?? payment.Status.ToString());
        }

        if (payment.PollUrl is null)
        {
            // Manual/offline payment — no aggregator to poll; status only ever changes via
            // OrderTools.ConfirmPaymentAsync.
            return new PaymentStatusResult(paymentReference, payment.Status.ToString());
        }

        var connection = await dbContext.PaynowConnections.FirstOrDefaultAsync(c => c.BusinessId == payment.BusinessId, cancellationToken)
            ?? throw new InvalidOperationException($"Payment {payment.Id} has a PollUrl but its business has no PaynowConnection.");

        var status = await paynowClient.PollTransactionAsync(payment.PollUrl, connection.IntegrationKey, cancellationToken);
        return new PaymentStatusResult(paymentReference, status.Status);
    }
}
