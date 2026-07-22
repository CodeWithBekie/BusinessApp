using System.Text.Json;
using AiBusinessPlatform.Application.WhatsApp;

namespace AiBusinessPlatform.Application.Tests;

public class MetaWebhookPayloadParserTests
{
    private static MetaWebhookPayload Parse(string json) =>
        JsonSerializer.Deserialize<MetaWebhookPayload>(json)!;

    [Fact]
    public void TryParseFirstTextMessage_extracts_a_single_text_message()
    {
        const string json = """
        {
          "object": "whatsapp_business_account",
          "entry": [
            {
              "id": "waba-1",
              "changes": [
                {
                  "field": "messages",
                  "value": {
                    "messaging_product": "whatsapp",
                    "metadata": { "display_phone_number": "15551234567", "phone_number_id": "pn-1" },
                    "contacts": [ { "wa_id": "263771234567", "profile": { "name": "Jane" } } ],
                    "messages": [
                      {
                        "from": "263771234567",
                        "id": "wamid.abc123",
                        "timestamp": "1700000000",
                        "type": "text",
                        "text": { "body": "Do you have cement in stock?" }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
        """;

        var result = MetaWebhookPayloadParser.TryParseFirstTextMessage(Parse(json), out var multipleMessagesFound);

        Assert.NotNull(result);
        Assert.Equal("pn-1", result!.PhoneNumberId);
        Assert.Equal("263771234567", result.CustomerWaId);
        Assert.Equal("wamid.abc123", result.MessageId);
        Assert.Equal("Do you have cement in stock?", result.Text);
        Assert.False(multipleMessagesFound);
    }

    [Fact]
    public void TryParseFirstTextMessage_flags_but_still_returns_the_first_message_when_a_payload_batches_multiple()
    {
        const string json = """
        {
          "object": "whatsapp_business_account",
          "entry": [
            {
              "id": "waba-1",
              "changes": [
                {
                  "field": "messages",
                  "value": {
                    "metadata": { "phone_number_id": "pn-1" },
                    "messages": [
                      { "from": "111", "id": "wamid.first", "type": "text", "text": { "body": "first" } },
                      { "from": "111", "id": "wamid.second", "type": "text", "text": { "body": "second" } }
                    ]
                  }
                }
              ]
            }
          ]
        }
        """;

        var result = MetaWebhookPayloadParser.TryParseFirstTextMessage(Parse(json), out var multipleMessagesFound);

        Assert.NotNull(result);
        Assert.Equal("wamid.first", result!.MessageId);
        Assert.True(multipleMessagesFound);
    }

    [Fact]
    public void TryParseFirstTextMessage_returns_null_for_non_text_message_types()
    {
        const string json = """
        {
          "object": "whatsapp_business_account",
          "entry": [
            {
              "id": "waba-1",
              "changes": [
                {
                  "field": "messages",
                  "value": {
                    "metadata": { "phone_number_id": "pn-1" },
                    "messages": [
                      { "from": "111", "id": "wamid.img", "type": "image" }
                    ]
                  }
                }
              ]
            }
          ]
        }
        """;

        var result = MetaWebhookPayloadParser.TryParseFirstTextMessage(Parse(json), out var multipleMessagesFound);

        Assert.Null(result);
        Assert.False(multipleMessagesFound);
    }

    [Fact]
    public void TryParseFirstTextMessage_returns_null_when_there_are_no_messages_at_all()
    {
        const string json = """
        {
          "object": "whatsapp_business_account",
          "entry": [
            {
              "id": "waba-1",
              "changes": [
                {
                  "field": "messages",
                  "value": {
                    "metadata": { "phone_number_id": "pn-1" }
                  }
                }
              ]
            }
          ]
        }
        """;

        var result = MetaWebhookPayloadParser.TryParseFirstTextMessage(Parse(json), out var multipleMessagesFound);

        Assert.Null(result);
        Assert.False(multipleMessagesFound);
    }

    [Fact]
    public void TryParseFirstTextMessage_returns_null_for_an_empty_payload()
    {
        var payload = new MetaWebhookPayload("whatsapp_business_account", Entry: null);

        var result = MetaWebhookPayloadParser.TryParseFirstTextMessage(payload, out var multipleMessagesFound);

        Assert.Null(result);
        Assert.False(multipleMessagesFound);
    }
}
