namespace AiBusinessPlatform.Api.Contracts;

public record UploadDocumentRequest(string Title, string Content, string? SourceType);
