namespace AiBusinessPlatform.Application.Tools;

// New ground, not a spec section — printable/downloadable PDF documents for a POS/quotation/
// invoice order and a supplier purchase order. Deliberately not exposed as an MCP tool: MCP tools
// return JSON, not binary files, so the Assistant can point the user at the order/PO to download
// it from there rather than emitting a PDF itself. Shared by the two REST download endpoints only.
public interface IDocumentGenerationTools
{
    Task<byte[]> GenerateOrderReceiptAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default);

    Task<byte[]> GeneratePurchaseOrderDocumentAsync(Guid businessId, Guid purchaseOrderId, CancellationToken cancellationToken = default);
}
