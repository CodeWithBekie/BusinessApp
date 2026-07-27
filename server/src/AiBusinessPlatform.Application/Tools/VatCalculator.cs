namespace AiBusinessPlatform.Application.Tools;

public static class VatCalculator
{
    public static decimal CalculateVat(decimal subtotal, decimal vatRate) => Math.Round(subtotal * vatRate, 2);
}
