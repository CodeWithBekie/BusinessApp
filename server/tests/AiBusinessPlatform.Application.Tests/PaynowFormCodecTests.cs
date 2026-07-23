using AiBusinessPlatform.Application.Payments;

namespace AiBusinessPlatform.Application.Tests;

public class PaynowFormCodecTests
{
    [Fact]
    public void ParseOrdered_preserves_the_original_field_order()
    {
        const string body = "status=Paid&reference=INV-ABC123&amount=12.50&paynowreference=999&hash=DEADBEEF";

        var result = PaynowFormCodec.ParseOrdered(body);

        Assert.Equal(["status", "reference", "amount", "paynowreference", "hash"], result.Select(f => f.Key));
        Assert.Equal(["Paid", "INV-ABC123", "12.50", "999", "DEADBEEF"], result.Select(f => f.Value));
    }

    [Fact]
    public void ParseOrdered_url_decodes_keys_and_values()
    {
        const string body = "additionalinfo=Cement%2C%20Claw%20Hammer&authemail=owner%40example.test";

        var result = PaynowFormCodec.ParseOrdered(body);

        Assert.Equal("Cement, Claw Hammer", result[0].Value);
        Assert.Equal("owner@example.test", result[1].Value);
    }

    [Fact]
    public void ParseOrdered_treats_a_plus_sign_as_a_space()
    {
        const string body = "additionalinfo=Cement+and+Claw+Hammer";

        var result = PaynowFormCodec.ParseOrdered(body);

        Assert.Equal("Cement and Claw Hammer", result[0].Value);
    }

    [Fact]
    public void ParseOrdered_handles_a_field_with_no_value()
    {
        const string body = "status=&reference=INV-1";

        var result = PaynowFormCodec.ParseOrdered(body);

        Assert.Equal(string.Empty, result[0].Value);
        Assert.Equal("INV-1", result[1].Value);
    }

    [Fact]
    public void ParseOrdered_returns_empty_for_an_empty_body()
    {
        var result = PaynowFormCodec.ParseOrdered("");

        Assert.Empty(result);
    }

    [Fact]
    public void Encode_then_ParseOrdered_round_trips_order_and_special_characters()
    {
        var fields = new List<KeyValuePair<string, string>>
        {
            new("reference", "INV-ABC123"),
            new("additionalinfo", "Cement, Claw Hammer & Paint"),
            new("authemail", "owner@example.test"),
            new("amount", "12.50")
        };

        var encoded = PaynowFormCodec.Encode(fields);
        var decoded = PaynowFormCodec.ParseOrdered(encoded);

        Assert.Equal(fields.Select(f => f.Key), decoded.Select(f => f.Key));
        Assert.Equal(fields.Select(f => f.Value), decoded.Select(f => f.Value));
    }
}
