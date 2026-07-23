using System.ClientModel;
using Microsoft.Extensions.AI;
using OpenAI;

namespace AiBusinessPlatform.Infrastructure.AI;

// Shared between the Api and Mcp projects (both need RagTools' embedding generator, and
// duplicating this OpenAIClient wiring twice would risk the two drifting apart).
public static class LmStudioEmbeddingGeneratorFactory
{
    public static IEmbeddingGenerator<string, Embedding<float>> Create(LmStudioOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.EmbeddingModel))
        {
            throw new InvalidOperationException("LmStudio:EmbeddingModel is not configured (appsettings.json).");
        }

        var openAIClient = new OpenAIClient(
            new ApiKeyCredential(options.ApiKey),
            new OpenAIClientOptions { Endpoint = new Uri(options.BaseUrl) });

        return openAIClient.GetEmbeddingClient(options.EmbeddingModel).AsIEmbeddingGenerator();
    }
}
