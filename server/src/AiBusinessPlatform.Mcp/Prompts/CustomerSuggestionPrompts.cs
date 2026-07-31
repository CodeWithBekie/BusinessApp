using System.ComponentModel;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Prompts;

// Starter-message prompts for the customer's Assistant chat — backs the mobile app's "suggestion
// chip" row (mobile/app/(customer)/assistant.tsx). See OwnerSuggestionPrompts' remarks for the
// rationale; CustomerAssistantEndpoints.cs's GET /api/customer-assistant/prompts resolves these.
[McpServerPromptType]
public class CustomerSuggestionPrompts
{
    [McpServerPrompt(Name = "what_can_i_order", Title = "What can I order from this business?")]
    [Description("A starter prompt asking what's available to order.")]
    public string WhatCanIOrder() => "What can I order from this business?";

    [McpServerPrompt(Name = "wheres_my_order", Title = "Where is my order?")]
    [Description("A starter prompt asking for the status of the customer's order.")]
    public string WheresMyOrder() => "Where is my order?";

    [McpServerPrompt(Name = "cancel_last_order", Title = "I want to cancel my last order")]
    [Description("A starter prompt asking to cancel the customer's most recent order.")]
    public string CancelLastOrder() => "I want to cancel my last order";
}
