using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Completions;

// Backs the "completions" MCP capability — live autocomplete for the two resource-template
// variables this server exposes (business://orders/{orderId}, business://purchase-orders/{purchaseOrderId}),
// the same ones BusinessResources.cs already serves. Reuses the exact Application-layer list
// methods the REST/MCP tool surface already calls (Section 10.7's "one function, multiple entry
// points") — no new query logic. Prompts currently take no arguments, so a PromptReference always
// falls through to an empty result.
public static class BusinessCompletionHandler
{
    private const int MaxSuggestions = 10;

    public static async ValueTask<CompleteResult> HandleAsync(RequestContext<CompleteRequestParams> context, CancellationToken cancellationToken)
    {
        if (context.Params?.Ref is not ResourceTemplateReference templateRef)
        {
            return Empty();
        }

        var partial = context.Params.Argument.Value;
        var services = context.Services ?? throw new InvalidOperationException("Completion request has no service provider.");
        var tenantProvider = services.GetRequiredService<ICurrentTenantProvider>();

        if (templateRef.Uri == "business://orders/{orderId}" && context.Params.Argument.Name == "orderId")
        {
            var orderTools = services.GetRequiredService<IOrderTools>();
            var orders = await orderTools.ListOrdersAsync(tenantProvider.CurrentBusinessId, null, cancellationToken);
            return Matches(orders.Select(o => o.Id.ToString()), partial);
        }

        if (templateRef.Uri == "business://purchase-orders/{purchaseOrderId}" && context.Params.Argument.Name == "purchaseOrderId")
        {
            var purchaseOrderTools = services.GetRequiredService<IPurchaseOrderTools>();
            var purchaseOrders = await purchaseOrderTools.ListPurchaseOrdersAsync(tenantProvider.CurrentBusinessId, null, cancellationToken);
            return Matches(purchaseOrders.Select(po => po.Id.ToString()), partial);
        }

        return Empty();
    }

    private static CompleteResult Matches(IEnumerable<string> ids, string partial)
    {
        var values = ids
            .Where(id => string.IsNullOrEmpty(partial) || id.StartsWith(partial, StringComparison.OrdinalIgnoreCase))
            .Take(MaxSuggestions)
            .ToList();
        return new CompleteResult { Completion = new Completion { Values = values, Total = values.Count, HasMore = false } };
    }

    private static CompleteResult Empty() => new() { Completion = new Completion { Values = [], Total = 0, HasMore = false } };
}
