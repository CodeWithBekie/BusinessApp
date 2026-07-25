namespace AiBusinessPlatform.Application.Abstractions;

// Mirrors ICurrentUserProvider but resolves a marketplace CustomerAccount instead of a
// BusinessUser, from a distinct "customer_account_id" JWT claim never present on a business-owner
// token. Null whenever the caller is anonymous or authenticated as a business user instead.
public interface ICurrentCustomerProvider
{
    Guid? CurrentCustomerAccountId { get; }
}
