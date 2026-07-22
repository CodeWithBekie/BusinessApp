using System.Text.RegularExpressions;

namespace AiBusinessPlatform.Infrastructure.Tools;

public record DocumentChunkText(string Content, string? SectionLabel, int ChunkIndex);

// Section 10.6 — paragraph-first chunking with a size-bounded fallback: keeps typical short
// FAQ/policy paragraphs as one chunk each (good citation granularity) while safely handling an
// unusually long paragraph via fixed-size windows rather than silently dropping content.
public static class DocumentChunker
{
    private const int TargetChunkSize = 800;
    private const int MaxParagraphSize = 1200;
    private const int WindowSize = 1000;
    private const int WindowOverlap = 150;

    public static IReadOnlyList<DocumentChunkText> Chunk(string content)
    {
        var normalized = content.Replace("\r\n", "\n").Trim();
        var paragraphs = Regex.Split(normalized, @"\n\s*\n")
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .ToList();

        var chunks = new List<DocumentChunkText>();
        var currentParagraphs = new List<string>();
        var currentSize = 0;
        string? currentSectionLabel = null;

        void Flush()
        {
            if (currentParagraphs.Count == 0)
            {
                return;
            }

            chunks.Add(new DocumentChunkText(string.Join("\n\n", currentParagraphs), currentSectionLabel, chunks.Count));
            currentParagraphs.Clear();
            currentSize = 0;
            currentSectionLabel = null;
        }

        foreach (var paragraph in paragraphs)
        {
            if (paragraph.Length > MaxParagraphSize)
            {
                Flush();
                var label = DetectSectionLabel(paragraph);
                foreach (var window in SplitIntoWindows(paragraph))
                {
                    chunks.Add(new DocumentChunkText(window, label, chunks.Count));
                }
                continue;
            }

            if (currentSize + paragraph.Length > TargetChunkSize && currentParagraphs.Count > 0)
            {
                Flush();
            }

            if (currentParagraphs.Count == 0)
            {
                currentSectionLabel = DetectSectionLabel(paragraph);
            }

            currentParagraphs.Add(paragraph);
            currentSize += paragraph.Length;
        }

        Flush();
        return chunks;
    }

    // A short first line with no trailing sentence punctuation reads as a heading rather than
    // the start of a longer sentence — e.g. "Return Policy" or "## Delivery Areas".
    private static string? DetectSectionLabel(string paragraph)
    {
        var firstLine = paragraph.Split('\n')[0].Trim();
        if (firstLine.Length == 0 || firstLine.Length > 60)
        {
            return null;
        }

        if (firstLine.StartsWith('#'))
        {
            return firstLine.TrimStart('#', ' ');
        }

        return firstLine.EndsWith('.') || firstLine.EndsWith(',') ? null : firstLine;
    }

    private static IEnumerable<string> SplitIntoWindows(string text)
    {
        var position = 0;
        while (position < text.Length)
        {
            var length = Math.Min(WindowSize, text.Length - position);
            yield return text.Substring(position, length);

            if (position + length >= text.Length)
            {
                yield break;
            }

            position += WindowSize - WindowOverlap;
        }
    }
}
