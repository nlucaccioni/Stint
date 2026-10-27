// SPDX-License-Identifier: MIT
// Stint's Local API messages (docs/protocol.md in the Stint repo; keep in step).
//
// C# notes:
// - A `record` is an immutable data class, like a TypeScript type whose values
//   you never mutate. Records compare by value, so two equal states are ==.
// - `string?` means "string or null" (nullable reference types are on, like
//   TypeScript's strictNullChecks).
// - `IReadOnlyList<T>` is a read-only array, like `readonly T[]`.
namespace Stint.Keypad
{
    using System.Text.Json;
    using System.Text.Json.Serialization;

    // Billable and Rate were added to the protocol later; the defaults cover an older Stint.
    public record RunningTimer(
        string SessionId,
        string ProjectId,
        string ClientId,
        long StartedAt,
        bool Billable = false,
        Money? Rate = null);

    public record Money(string Currency, long Cents);

    public record Totals(
        long TodaySeconds,
        long WeekSeconds,
        long UnbilledSeconds,
        IReadOnlyList<Money> UnbilledAmounts);

    public record StintState(RunningTimer? Running, IReadOnlyList<string?> Favorites, Totals Totals);

    public record ProjectEntry(string Id, string ClientId, string Name, string ClientName, string Color);

    public record StintError(string Code, string Message, string? Id);

    /// <summary>One message from Stint. Exactly one of the properties is set.</summary>
    public record ServerMessage(
        StintState? State = null,
        IReadOnlyList<ProjectEntry>? Projects = null,
        StintError? Error = null);

    public static class Protocol
    {
        public const int Version = 1;

        // Close codes Stint uses (docs/protocol.md "Handshake").
        public const int CloseUnauthorized = 4001;
        public const int CloseUnsupportedVersion = 4002;
        public const int CloseTokenChanged = 4003;

        // JsonSerializerDefaults.Web: camelCase names ("todaySeconds" <-> TodaySeconds),
        // and fields the plugin doesn't know about are ignored.
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        /// <summary>
        /// Parse one message. Returns null for messages this plugin doesn't know
        /// (a newer Stint may add some) or that aren't valid JSON.
        /// </summary>
        public static ServerMessage? Parse(string text)
        {
            try
            {
                using var doc = JsonDocument.Parse(text);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object ||
                    !root.TryGetProperty("type", out var type))
                {
                    return null;
                }

                // `switch` with `=>` arms is a switch expression: it returns a value,
                // like a chain of ternaries keyed on type.GetString().
                return type.GetString() switch
                {
                    "state" => new ServerMessage(State: root.Deserialize<StintState>(Json)),
                    "projects" => new ServerMessage(
                        Projects: root.GetProperty("list").Deserialize<List<ProjectEntry>>(Json)),
                    "error" => new ServerMessage(Error: root.Deserialize<StintError>(Json)),
                    _ => null,
                };
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
            {
                return null;
            }
        }

        public static string Hello(string token) =>
            Serialize(new { type = "hello", token, client = "logi-keypad", v = Version });

        public static string Start(string projectId) => Serialize(new { type = "start", projectId });

        public static string Toggle(string projectId) => Serialize(new { type = "toggle", projectId });

        public static string Stop() => Serialize(new { type = "stop" });

        public static string OpenSwitcher() => Serialize(new { type = "openSwitcher" });

        // `new { ... }` is an anonymous object, like a JS object literal.
        private static string Serialize(object message) => JsonSerializer.Serialize(message, Json);
    }
}
