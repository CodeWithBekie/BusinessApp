using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class DocumentGenerationTools(
    AiBusinessPlatformDbContext dbContext,
    ICurrentTenantProvider tenantProvider,
    IOrderTools orderTools,
    IPurchaseOrderTools purchaseOrderTools) : IDocumentGenerationTools
{
    public async Task<byte[]> GenerateOrderReceiptAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await orderTools.GetOrderAsync(businessId, orderId, cancellationToken);
        var businessName = await GetBusinessNameAsync(cancellationToken);

        var lines = order.Items.Select(i => (i.Name, i.Quantity, i.UnitPrice, i.Subtotal)).ToList();

        var footerNotes = new List<string>();
        if (order.Payment is not null)
        {
            footerNotes.Add($"Paid via {order.Payment.Provider} — Ref: {order.Payment.ProviderReference}");
            if (order.Payment.AmountTendered is not null)
            {
                footerNotes.Add(
                    $"Tendered: {FormatMoney(order.Payment.AmountTendered.Value, order.Currency)}   ·   Change: {FormatMoney(order.Payment.ChangeDue ?? 0, order.Currency)}");
            }
        }

        return BuildDocument(
            businessName, "Receipt",
            $"{order.CustomerName ?? order.CustomerWhatsAppNumber}  ·  {order.CreatedAt:d MMM yyyy, HH:mm}",
            lines, order.TotalAmount, order.Currency, footerNotes);
    }

    public async Task<byte[]> GeneratePurchaseOrderDocumentAsync(Guid businessId, Guid purchaseOrderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var po = await purchaseOrderTools.GetPurchaseOrderAsync(businessId, purchaseOrderId, cancellationToken);
        var businessName = await GetBusinessNameAsync(cancellationToken);

        var lines = po.Items.Select(i => (i.Name, i.Quantity, i.UnitCost, i.Subtotal)).ToList();

        return BuildDocument(
            businessName, "Purchase Order",
            $"Supplier: {po.SupplierName}  ·  {po.CreatedAt:d MMM yyyy}",
            lines, po.TotalAmount, po.Currency, [$"Status: {po.Status}"]);
    }

    private async Task<string> GetBusinessNameAsync(CancellationToken cancellationToken)
    {
        var business = await dbContext.Businesses.AsNoTracking().FirstOrDefaultAsync(b => b.Id == tenantProvider.CurrentBusinessId, cancellationToken);
        return business?.Name ?? "Business";
    }

    private static string FormatMoney(decimal amount, string currency) => $"{currency} {amount:0.00}";

    // One shared layout for both documents: header (business name + title + subtitle), a line-item
    // table, a bold total, and optional footer notes (payment reference/change, or PO status).
    private static byte[] BuildDocument(
        string businessName, string documentTitle, string subtitle,
        IReadOnlyList<(string Name, int Quantity, decimal UnitPrice, decimal Subtotal)> lines,
        decimal total, string currency, IReadOnlyList<string> footerNotes)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(11));

                page.Header().Column(col =>
                {
                    col.Item().Text(businessName).FontSize(16).Bold();
                    col.Item().Text(documentTitle).FontSize(20).Bold();
                    col.Item().Text(subtitle).FontSize(10).FontColor(Colors.Grey.Darken1);
                });

                page.Content().PaddingTop(15).Column(col =>
                {
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1.4f);
                            columns.RelativeColumn(1.4f);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Text("Item").Bold();
                            header.Cell().AlignRight().Text("Qty").Bold();
                            header.Cell().PaddingLeft(8).AlignRight().Text("Price").Bold();
                            header.Cell().PaddingLeft(8).AlignRight().Text("Subtotal").Bold();
                        });

                        foreach (var line in lines)
                        {
                            table.Cell().PaddingVertical(2).Text(line.Name);
                            table.Cell().PaddingVertical(2).AlignRight().Text(line.Quantity.ToString());
                            table.Cell().PaddingVertical(2).PaddingLeft(8).AlignRight().Text(FormatMoney(line.UnitPrice, currency));
                            table.Cell().PaddingVertical(2).PaddingLeft(8).AlignRight().Text(FormatMoney(line.Subtotal, currency));
                        }
                    });

                    col.Item().PaddingTop(10).AlignRight().Text($"Total: {FormatMoney(total, currency)}").FontSize(14).Bold();

                    foreach (var note in footerNotes)
                    {
                        col.Item().PaddingTop(6).Text(note).FontSize(10);
                    }
                });

                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Generated ").FontSize(8);
                    text.Span(DateTimeOffset.UtcNow.ToString("d MMM yyyy, HH:mm")).FontSize(8);
                });
            });
        });

        return document.GeneratePdf();
    }
}
