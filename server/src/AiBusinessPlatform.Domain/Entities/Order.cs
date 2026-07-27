namespace AiBusinessPlatform.Domain.Entities;

public class Order : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public Guid CustomerId { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Quoted;
    public decimal TotalAmount { get; set; } // VAT-inclusive grand total — what's actually charged
    public decimal VatAmount { get; set; }
    public int? InvoiceNumber { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
