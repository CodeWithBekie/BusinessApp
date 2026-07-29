# AI/

Wires the local [LM Studio](https://lmstudio.ai/) server into `Microsoft.Extensions.AI`'s
provider-agnostic abstractions. There is no hosted Anthropic/OpenAI API call anywhere in this
system — every AI feature (WhatsApp agent, Assistant chat, RAG embeddings) talks to a model
running locally via LM Studio's OpenAI-compatible endpoint.

- **`LmStudioOptions.cs`** — config: `BaseUrl` (default `http://localhost:1234/v1`), `Model`
  (chat), `EmbeddingModel`, `ApiKey` (defaults to LM Studio's placeholder value `"lm-studio"` — LM
  Studio doesn't actually check it).
- **`LmStudioEmbeddingGeneratorFactory.cs`** — wraps LM Studio's endpoint in an `OpenAIClient` and
  exposes it as `IEmbeddingGenerator<string, Embedding<float>>`. Shared by both `Api` and `Mcp` so
  the wiring can't drift between them. (The chat client is built the same way directly in
  `Api/Program.cs` — `OpenAIClient.GetChatClient(...).AsIChatClient()`, wrapped by
  `ChatClientBuilder(...).UseFunctionInvocation()` for tool-calling.)

## A documentation gap worth knowing about

The live embedding dimension is **768** (`text-embedding-nomic-embed-text-v1.5`), confirmed by
`Infrastructure/Data/Configurations/DocumentChunkConfiguration.cs`'s actual `vector(768)` column
type — but `Domain/Entities/DocumentChunk.cs`'s own comment still says `vector(1536)` (an OpenAI
`text-embedding-3-small`-sized placeholder from before LM Studio was wired in). Trust the
migration/configuration, not the entity comment, if the two ever disagree.

## Debugging

If any AI-touching endpoint errors immediately: confirm LM Studio is actually running, that the
loaded chat model supports function/tool calling (not every local model does), and that
`LmStudio:BaseUrl`/`Model`/`EmbeddingModel` in `appsettings.json` match what's actually loaded.
