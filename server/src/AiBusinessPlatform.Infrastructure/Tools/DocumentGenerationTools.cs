using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain.Entities;
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
    // ZIMRA-style fiscal invoice layout. TIN/VAT No/Device Serial No/Fiscal Device ID are real
    // fields the owner fills in themselves in Settings (blank by default, printed only if set) —
    // never fabricated. Deliberately excludes the QR code and "Verification code / verify at
    // receipt.zimra.org" line from the reference template: both are only meaningful if generated
    // by a real ZIMRA-registered fiscal device talking to ZIMRA's servers, and printing a fake one
    // would misrepresent a non-fiscalized business's invoice as government-verified.
    public async Task<byte[]> GenerateOrderReceiptAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await orderTools.GetOrderAsync(businessId, orderId, cancellationToken);
        var business = await dbContext.Businesses.AsNoTracking().FirstOrDefaultAsync(b => b.Id == tenantProvider.CurrentBusinessId, cancellationToken)
            ?? throw new InvalidOperationException("Business not found.");
        var customer = await dbContext.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == order.CustomerId, cancellationToken);

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

        return BuildOrderInvoiceDocument(business, customer, order, footerNotes);
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

        return BuildPurchaseOrderDocument(
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

    // Seller/buyer blocks, a fiscal-style line-item table (Code/Description/Qty/Price excl./Amount
    // excl./VAT/Total incl.), and a tax-exclusive/VAT/inclusive totals breakdown — a different
    // shape from BuildPurchaseOrderDocument's simple item/qty/price/subtotal layout because this is
    // the fiscal sale-to-a-customer document (Section: ZIMRA-style invoice redesign), not a
    // business-to-supplier PO.
    private static byte[] BuildOrderInvoiceDocument(
        Business business, Customer? customer, OrderDetailSummary order, IReadOnlyList<string> footerNotes)
    {
        var vatApplies = order.VatAmount > 0;
        var documentTitle = vatApplies ? "Tax Invoice" : "Receipt";
        var totalExcl = order.TotalAmount - order.VatAmount;

        var document = QuestPDF.Fluent.Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(col =>
                {
                    col.Item().Text(business.Name).FontSize(16).Bold();
                    col.Item().Text(documentTitle).FontSize(18).Bold();
                });

                page.Content().PaddingTop(12).Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(sellerCol =>
                        {
                            sellerCol.Item().Text("Seller").FontSize(9).Bold().FontColor(Colors.Grey.Darken1);
                            sellerCol.Item().Text(business.Name).Bold();
                            if (!string.IsNullOrWhiteSpace(business.Tin)) sellerCol.Item().Text($"TIN: {business.Tin}");
                            if (!string.IsNullOrWhiteSpace(business.VatNumber)) sellerCol.Item().Text($"VAT No: {business.VatNumber}");
                            if (!string.IsNullOrWhiteSpace(business.Address)) sellerCol.Item().Text(business.Address!);
                            if (!string.IsNullOrWhiteSpace(business.Email)) sellerCol.Item().Text(business.Email!);
                            if (!string.IsNullOrWhiteSpace(business.Phone)) sellerCol.Item().Text(business.Phone!);
                        });

                        row.RelativeItem().Column(buyerCol =>
                        {
                            buyerCol.Item().Text("Buyer").FontSize(9).Bold().FontColor(Colors.Grey.Darken1);
                            buyerCol.Item().Text(order.CustomerName ?? "Walk-in Customer").Bold();
                            if (!string.IsNullOrWhiteSpace(customer?.Tin)) buyerCol.Item().Text($"TIN: {customer!.Tin}");
                            if (!string.IsNullOrWhiteSpace(customer?.Address)) buyerCol.Item().Text(customer!.Address!);
                            if (!string.IsNullOrWhiteSpace(customer?.Email)) buyerCol.Item().Text(customer!.Email!);
                            if (!string.IsNullOrWhiteSpace(order.CustomerWhatsAppNumber)) buyerCol.Item().Text(order.CustomerWhatsAppNumber);
                        });
                    });

                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Column(metaCol =>
                        {
                            if (order.InvoiceNumber is not null) metaCol.Item().Text($"Invoice No: {order.InvoiceNumber}");
                            metaCol.Item().Text($"Date: {order.CreatedAt:d MMM yyyy, HH:mm}");
                        });

                        row.RelativeItem().Column(metaCol =>
                        {
                            if (!string.IsNullOrWhiteSpace(business.DeviceSerialNumber)) metaCol.Item().AlignRight().Text($"Device Serial No: {business.DeviceSerialNumber}");
                            if (!string.IsNullOrWhiteSpace(business.FiscalDeviceId)) metaCol.Item().AlignRight().Text($"Fiscal Device ID: {business.FiscalDeviceId}");
                        });
                    });

                    col.Item().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.1f);
                            columns.RelativeColumn(2.4f);
                            columns.RelativeColumn(0.8f);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(1.2f);
                            columns.RelativeColumn(1f);
                            columns.RelativeColumn(1.3f);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Text("Code").Bold();
                            header.Cell().Text("Description").Bold();
                            header.Cell().AlignRight().Text("Qty").Bold();
                            header.Cell().PaddingLeft(4).AlignRight().Text("Price").Bold();
                            header.Cell().PaddingLeft(4).AlignRight().Text("Amount").Bold();
                            header.Cell().PaddingLeft(4).AlignRight().Text("VAT").Bold();
                            header.Cell().PaddingLeft(4).AlignRight().Text("Total").Bold();
                        });

                        foreach (var line in order.Items)
                        {
                            table.Cell().PaddingVertical(2).Text(line.Code);
                            table.Cell().PaddingVertical(2).Text(line.Name);
                            table.Cell().PaddingVertical(2).AlignRight().Text(line.Quantity.ToString());
                            table.Cell().PaddingVertical(2).PaddingLeft(4).AlignRight().Text(FormatMoney(line.UnitPrice, order.Currency));
                            table.Cell().PaddingVertical(2).PaddingLeft(4).AlignRight().Text(FormatMoney(line.Subtotal, order.Currency));
                            table.Cell().PaddingVertical(2).PaddingLeft(4).AlignRight().Text(FormatMoney(line.VatAmount, order.Currency));
                            table.Cell().PaddingVertical(2).PaddingLeft(4).AlignRight().Text(FormatMoney(line.Subtotal + line.VatAmount, order.Currency));
                        }
                    });

                    col.Item().PaddingTop(10).AlignRight().Text($"Total (excl. tax): {FormatMoney(totalExcl, order.Currency)}").FontSize(10);
                    if (vatApplies)
                    {
                        col.Item().AlignRight().Text($"Total {business.VatRate:0.##%} VAT: {FormatMoney(order.VatAmount, order.Currency)}").FontSize(10);
                    }
                    col.Item().PaddingTop(4).AlignRight().Text($"Invoice total: {FormatMoney(order.TotalAmount, order.Currency)}").FontSize(14).Bold();

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

    // Unchanged simple layout for the business-to-supplier Purchase Order document — a different
    // concept from the fiscal sale-to-a-customer invoice above, out of scope for the ZIMRA redesign.
    private static byte[] BuildPurchaseOrderDocument(
        string businessName, string documentTitle, string subtitle,
        IReadOnlyList<(string Name, int Quantity, decimal UnitPrice, decimal Subtotal)> lines,
        decimal total, string currency, IReadOnlyList<string> footerNotes)
    {
        var document = QuestPDF.Fluent.Document.Create(container =>
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
