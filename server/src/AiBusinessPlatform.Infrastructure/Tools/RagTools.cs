using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class RagTools(
    AiBusinessPlatformDbContext dbContext,
    ICurrentTenantProvider tenantProvider,
    IEmbeddingGenerator<string, Embedding<float>> embeddingGenerator) : IRagTools
{
    private const int TopK = 5;

    public async Task<IReadOnlyList<RetrievedDocumentChunk>> RetrieveRelevantDocumentsAsync(Guid businessId, string query, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var embeddings = await embeddingGenerator.GenerateAsync([query], cancellationToken: cancellationToken);
        var queryVector = new Vector(embeddings[0].Vector);

        var matches = await dbContext.DocumentChunks
            .Where(c => c.Embedding != null)
            .Select(c => new
            {
                c.DocumentId,
                c.Content,
                c.SectionLabel,
                Distance = c.Embedding!.CosineDistance(queryVector)
            })
            .OrderBy(m => m.Distance)
            .Take(TopK)
            .ToListAsync(cancellationToken);

        var documentIds = matches.Select(m => m.DocumentId).Distinct().ToList();
        var titlesById = await dbContext.Documents
            .Where(d => documentIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Title, cancellationToken);

        return matches
            .Select(m => new RetrievedDocumentChunk(
                m.DocumentId,
                titlesById.GetValueOrDefault(m.DocumentId, "Unknown document"),
                m.SectionLabel,
                m.Content,
                (float)(1 - m.Distance)))
            .ToList();
    }

    public async Task<IngestDocumentResult> IngestDocumentAsync(Guid businessId, string title, string sourceType, string content, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var document = new Document
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            Title = title,
            SourceType = sourceType,
            UploadedAt = DateTimeOffset.UtcNow
        };
        dbContext.Documents.Add(document);

        var chunkTexts = DocumentChunker.Chunk(content);
        if (chunkTexts.Count == 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return new IngestDocumentResult(document.Id, 0);
        }

        var embeddings = await embeddingGenerator.GenerateAsync(chunkTexts.Select(c => c.Content), cancellationToken: cancellationToken);

        for (var i = 0; i < chunkTexts.Count; i++)
        {
            dbContext.DocumentChunks.Add(new DocumentChunk
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                DocumentId = document.Id,
                Content = chunkTexts[i].Content,
                Embedding = new Vector(embeddings[i].Vector),
                ChunkIndex = chunkTexts[i].ChunkIndex,
                SectionLabel = chunkTexts[i].SectionLabel
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return new IngestDocumentResult(document.Id, chunkTexts.Count);
    }
}
