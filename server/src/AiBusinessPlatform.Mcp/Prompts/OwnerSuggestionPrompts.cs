using System.ComponentModel;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Prompts;

// Starter-message prompts for the business owner's Assistant chat — backs the mobile app's
// "suggestion chip" row (mobile/app/(tabs)/assistant.tsx). Static text, no Application-layer
// dependency: the value of moving these onto the MCP server is that the chip's display title and
// the actual message sent to the model can differ, and either can be updated with a server deploy
// instead of a mobile release. See AssistantEndpoints.cs's GET /api/assistant/prompts, which
// resolves these by name and forwards {name, title, message} to the mobile app.
[McpServerPromptType]
public class OwnerSuggestionPrompts
{
    [McpServerPrompt(Name = "sales_this_week", Title = "How are sales this week?")]
    [Description("A starter prompt asking the assistant to summarize this week's sales.")]
    public string SalesThisWeek() => "How are sales this week? Give me a quick summary.";

    [McpServerPrompt(Name = "top_selling_items", Title = "What were our top-selling items this month?")]
    [Description("A starter prompt asking the assistant for this month's best-selling items.")]
    public string TopSellingItems() => "What were our top-selling items this month?";

    [McpServerPrompt(Name = "sales_today", Title = "Any sales today?")]
    [Description("A starter prompt asking the assistant for today's sales so far.")]
    public string SalesToday() => "Any sales today? Give me the total and a quick breakdown.";
}
