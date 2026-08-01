using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
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
    // Shared brand palette, matching mobile/constants/theme.ts (tint blue + semantic colors) so a
    // printed document reads as the same product as the app, not a bolted-on afterthought.
    private static readonly Color BrandColor = Color.FromHex("#007AFF");
    private static readonly Color BrandColorSoft = Color.FromHex("#E6F2FF");
    private static readonly Color TextColor = Color.FromHex("#1C1C1E");
    private static readonly Color MutedColor = Color.FromHex("#6B7280");
    private static readonly Color BorderColor = Color.FromHex("#E2E8F0");
    private static readonly Color SuccessColor = Color.FromHex("#2E7D32");
    private static readonly Color WarningColor = Color.FromHex("#F2994A");
    private static readonly Color DangerColor = Color.FromHex("#C0392B");
    private static readonly Color NeutralColor = Color.FromHex("#8E8E93");

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
        var business = await dbContext.Businesses.AsNoTracking().FirstOrDefaultAsync(b => b.Id == tenantProvider.CurrentBusinessId, cancellationToken)
            ?? throw new InvalidOperationException("Business not found.");
        var supplier = await dbContext.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == po.SupplierId, cancellationToken);

        return BuildPurchaseOrderDocument(business, supplier, po);
    }

    private static string FormatMoney(decimal amount, string currency) => $"{currency} {amount:0.00}";

    private static Color PurchaseOrderStatusColor(PurchaseOrderStatus status) => status switch
    {
        PurchaseOrderStatus.Ordered => WarningColor,
        PurchaseOrderStatus.Received => SuccessColor,
        PurchaseOrderStatus.Cancelled => DangerColor,
        _ => NeutralColor,
    };

    // Business name + document title/number in a right-aligned block, underlined by a brand-colored
    // rule — the one letterhead element shared by every document this app generates.
    private static void ComposeLetterhead(ColumnDescriptor column, string businessName, string documentTitle, string documentNumber)
    {
        column.Item().Row(row =>
        {
            row.RelativeItem().Text(businessName).FontSize(18).Bold().FontColor(TextColor);
            row.ConstantItem(160).Column(titleCol =>
            {
                titleCol.Item().AlignRight().Text(documentTitle.ToUpperInvariant()).FontSize(14).Bold().FontColor(BrandColor).LetterSpacing(0.05f);
                titleCol.Item().AlignRight().Text(documentNumber).FontSize(9).FontColor(MutedColor);
            });
        });
        column.Item().PaddingTop(8).PaddingBottom(12).LineHorizontal(1.5f).LineColor(BrandColor);
    }

    // A labeled "Seller / Buyer / Supplier" info block — small uppercase brand-colored label, bold
    // name, then any non-blank contact lines. Shared by both documents so they read as one family
    // instead of two independently-styled layouts.
    private static void ComposePartyBlock(ColumnDescriptor column, string label, string name, params string?[] detailLines)
    {
        column.Item().Text(label.ToUpperInvariant()).FontSize(8).Bold().FontColor(BrandColor).LetterSpacing(0.05f);
        column.Item().PaddingTop(2).Text(name).FontSize(11).Bold().FontColor(TextColor);
        foreach (var line in detailLines)
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                column.Item().Text(line).FontSize(9).FontColor(MutedColor);
            }
        }
    }

    private static IContainer StyleTableHeaderCell(IContainer container) =>
        container.Background(BrandColor).PaddingVertical(6).PaddingHorizontal(4);

    private static IContainer StyleTableCell(IContainer container) =>
        container.BorderBottom(0.75f).BorderColor(BorderColor).PaddingVertical(6).PaddingHorizontal(3);

    private static void ComposeDocumentFooter(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().LineHorizontal(0.75f).LineColor(BorderColor);
            col.Item().PaddingTop(6).AlignCenter().Text(text =>
            {
                text.Span("Generated ").FontSize(8).FontColor(MutedColor);
                text.Span(DateTimeOffset.UtcNow.ToString("d MMM yyyy, HH:mm")).FontSize(8).FontColor(MutedColor);
            });
        });
    }

    // Seller/buyer blocks, a fiscal-style line-item table (Code/Description/Qty/Price excl./Amount
    // excl./VAT/Total incl.), and a tax-exclusive/VAT/inclusive totals breakdown — a different
    // shape from BuildPurchaseOrderDocument's item/qty/price/subtotal layout because this is the
    // fiscal sale-to-a-customer document, not a business-to-supplier PO. Both share the same brand
    // letterhead, party-block, and table styling helpers above.
    private static byte[] BuildOrderInvoiceDocument(
        Business business, Customer? customer, OrderDetailSummary order, IReadOnlyList<string> footerNotes)
    {
        var vatApplies = order.VatAmount > 0;
        var documentTitle = vatApplies ? "Tax Invoice" : "Receipt";
        var documentNumber = order.InvoiceNumber is not null ? $"Invoice No: {order.InvoiceNumber}" : $"Order #{order.Id.ToString()[..8].ToUpperInvariant()}";
        var totalExcl = order.TotalAmount - order.VatAmount;

        var document = QuestPDF.Fluent.Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor(TextColor));

                page.Header().Column(col => ComposeLetterhead(col, business.Name, documentTitle, documentNumber));

                page.Content().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(sellerCol => ComposePartyBlock(
                            sellerCol, "Seller", business.Name,
                            business.Tin is null ? null : $"TIN: {business.Tin}",
                            business.VatNumber is null ? null : $"VAT No: {business.VatNumber}",
                            business.Address, business.Email, business.Phone));

                        row.ConstantItem(16);

                        row.RelativeItem().Column(buyerCol => ComposePartyBlock(
                            buyerCol, "Buyer", order.CustomerName ?? "Walk-in Customer",
                            customer?.Tin is null ? null : $"TIN: {customer.Tin}",
                            customer?.Address, customer?.Email, order.CustomerWhatsAppNumber));
                    });

                    col.Item().PaddingTop(10).Row(row =>
                    {
                        row.RelativeItem().Text($"Date: {order.CreatedAt:d MMM yyyy, HH:mm}").FontSize(9).FontColor(MutedColor);

                        row.RelativeItem().Column(metaCol =>
                        {
                            if (!string.IsNullOrWhiteSpace(business.DeviceSerialNumber)) metaCol.Item().AlignRight().Text($"Device Serial No: {business.DeviceSerialNumber}").FontSize(9).FontColor(MutedColor);
                            if (!string.IsNullOrWhiteSpace(business.FiscalDeviceId)) metaCol.Item().AlignRight().Text($"Fiscal Device ID: {business.FiscalDeviceId}").FontSize(9).FontColor(MutedColor);
                        });
                    });

                    col.Item().PaddingTop(14).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(1.3f);
                            columns.RelativeColumn(2.4f);
                            columns.RelativeColumn(0.7f);
                            columns.RelativeColumn(1.15f);
                            columns.RelativeColumn(1.15f);
                            columns.RelativeColumn(0.9f);
                            columns.RelativeColumn(1.2f);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(StyleTableHeaderCell).Text("Code").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).Text("Description").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Qty").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Price").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Amount").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("VAT").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Total").FontSize(9).Bold().FontColor(Colors.White);
                        });

                        foreach (var line in order.Items)
                        {
                            table.Cell().Element(StyleTableCell).Text(line.Code).FontSize(9);
                            table.Cell().Element(StyleTableCell).Text(line.Name).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(line.Quantity.ToString()).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(FormatMoney(line.UnitPrice, order.Currency)).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(FormatMoney(line.Subtotal, order.Currency)).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(FormatMoney(line.VatAmount, order.Currency)).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(FormatMoney(line.Subtotal + line.VatAmount, order.Currency)).FontSize(9);
                        }
                    });

                    col.Item().PaddingTop(14).AlignRight().Width(220).Column(totalsCol =>
                    {
                        totalsCol.Item().Row(row =>
                        {
                            row.RelativeItem().Text("Total (excl. tax)").FontSize(9).FontColor(MutedColor);
                            row.RelativeItem().AlignRight().Text(FormatMoney(totalExcl, order.Currency)).FontSize(9);
                        });
                        if (vatApplies)
                        {
                            totalsCol.Item().PaddingTop(2).Row(row =>
                            {
                                row.RelativeItem().Text($"VAT ({business.VatRate:0.##%})").FontSize(9).FontColor(MutedColor);
                                row.RelativeItem().AlignRight().Text(FormatMoney(order.VatAmount, order.Currency)).FontSize(9);
                            });
                        }
                        totalsCol.Item().PaddingTop(6).LineHorizontal(1).LineColor(BrandColor);
                        totalsCol.Item().PaddingTop(6).Row(row =>
                        {
                            row.RelativeItem().Text("Invoice total").FontSize(12).Bold();
                            row.RelativeItem().AlignRight().Text(FormatMoney(order.TotalAmount, order.Currency)).FontSize(14).Bold().FontColor(BrandColor);
                        });
                    });

                    if (footerNotes.Count > 0)
                    {
                        col.Item().PaddingTop(14).Background(BrandColorSoft).Padding(8).Column(noteCol =>
                        {
                            foreach (var note in footerNotes)
                            {
                                noteCol.Item().Text(note).FontSize(9).FontColor(TextColor);
                            }
                        });
                    }

                    col.Item().PaddingTop(16).AlignCenter().Text("Thank you for your business.").FontSize(9).Italic().FontColor(MutedColor);
                });

                page.Footer().Element(ComposeDocumentFooter);
            });
        });

        return document.GeneratePdf();
    }

    // Business-to-supplier Purchase Order — same brand letterhead/party-block/table styling as the
    // invoice above so both documents read as one product, but a simpler shape (no VAT/fiscal
    // columns, since a PO isn't a fiscal sale document) with a colored status badge in place of a
    // buyer block.
    private static byte[] BuildPurchaseOrderDocument(Business business, Supplier? supplier, PurchaseOrderDetail po)
    {
        var documentNumber = $"PO #{po.Id.ToString()[..8].ToUpperInvariant()}";
        var statusColor = PurchaseOrderStatusColor(po.Status);

        var document = QuestPDF.Fluent.Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor(TextColor));

                page.Header().Column(col => ComposeLetterhead(col, business.Name, "Purchase Order", documentNumber));

                page.Content().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(supplierCol => ComposePartyBlock(
                            supplierCol, "Supplier", supplier?.Name ?? po.SupplierName,
                            supplier?.ContactPhone, supplier?.Email));

                        row.ConstantItem(16);

                        row.RelativeItem().Column(metaCol =>
                        {
                            metaCol.Item().Text("STATUS").FontSize(8).Bold().FontColor(BrandColor).LetterSpacing(0.05f);
                            metaCol.Item().PaddingTop(2).Text(po.Status.ToString()).FontSize(11).Bold().FontColor(statusColor);
                            metaCol.Item().PaddingTop(6).Text($"Date: {po.CreatedAt:d MMM yyyy}").FontSize(9).FontColor(MutedColor);
                            if (po.ReceivedAt is not null)
                            {
                                metaCol.Item().Text($"Received: {po.ReceivedAt:d MMM yyyy}").FontSize(9).FontColor(MutedColor);
                            }
                        });
                    });

                    col.Item().PaddingTop(14).Table(table =>
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
                            header.Cell().Element(StyleTableHeaderCell).Text("Item").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Qty").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Unit cost").FontSize(9).Bold().FontColor(Colors.White);
                            header.Cell().Element(StyleTableHeaderCell).AlignRight().Text("Subtotal").FontSize(9).Bold().FontColor(Colors.White);
                        });

                        foreach (var item in po.Items)
                        {
                            table.Cell().Element(StyleTableCell).Text(item.Name).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(item.Quantity.ToString()).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(FormatMoney(item.UnitCost, po.Currency)).FontSize(9);
                            table.Cell().Element(StyleTableCell).AlignRight().Text(FormatMoney(item.Subtotal, po.Currency)).FontSize(9);
                        }
                    });

                    col.Item().PaddingTop(14).AlignRight().Width(220).Column(totalsCol =>
                    {
                        totalsCol.Item().LineHorizontal(1).LineColor(BrandColor);
                        totalsCol.Item().PaddingTop(6).Row(row =>
                        {
                            row.RelativeItem().Text("Total").FontSize(12).Bold();
                            row.RelativeItem().AlignRight().Text(FormatMoney(po.TotalAmount, po.Currency)).FontSize(14).Bold().FontColor(BrandColor);
                        });
                        if (po.AmountPaid > 0)
                        {
                            totalsCol.Item().PaddingTop(4).Row(row =>
                            {
                                row.RelativeItem().Text("Paid").FontSize(9).FontColor(MutedColor);
                                row.RelativeItem().AlignRight().Text(FormatMoney(po.AmountPaid, po.Currency)).FontSize(9);
                            });
                            totalsCol.Item().Row(row =>
                            {
                                row.RelativeItem().Text("Owed").FontSize(9).FontColor(MutedColor);
                                row.RelativeItem().AlignRight().Text(FormatMoney(po.AmountOwed, po.Currency)).FontSize(9);
                            });
                        }
                    });
                });

                page.Footer().Element(ComposeDocumentFooter);
            });
        });

        return document.GeneratePdf();
    }
}
