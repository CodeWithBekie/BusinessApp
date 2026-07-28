namespace AiBusinessPlatform.Infrastructure;

public class AppOptions
{
    public const string SectionName = "App";

    // This app's own externally-reachable origin, used to build shareable staff-invite links
    // (StaffTools.InviteStaffAsync). Same accepted dev-placeholder limitation as
    // Payments.PaynowOptions.PublicBaseUrl — a localhost value here won't actually be reachable
    // from outside this machine until the app is really deployed.
    public string PublicBaseUrl { get; set; } = string.Empty;
}
