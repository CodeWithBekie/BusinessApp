namespace AiBusinessPlatform.Infrastructure.Payments;

public class EcoCashOptions
{
    public const string SectionName = "EcoCash";
    public string BaseUrl { get; set; } = "https://developers.ecocash.co.zw/sandbox/payment/v1";

    // Used to build the notifyUrl EcoCash calls back on — mirrors PaynowOptions.PublicBaseUrl exactly.
    public string PublicBaseUrl { get; set; } = string.Empty;
}
