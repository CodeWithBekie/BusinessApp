namespace AiBusinessPlatform.Infrastructure.Payments;

public class PaynowOptions
{
    public const string SectionName = "Paynow";

    public string BaseUrl { get; set; } = "https://www.paynow.co.zw";

    // This app's own externally-reachable origin, used to build resulturl/returnurl sent to
    // Paynow. Same "can't verify a real inbound call without a real public URL" limitation the
    // WhatsApp integration already accepted — a dev placeholder here won't actually be reachable
    // by Paynow's servers.
    public string PublicBaseUrl { get; set; } = string.Empty;
}
