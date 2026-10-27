// SPDX-License-Identifier: MIT
// Where to reach Stint: the port and token Stint writes to local-api.json in its
// data folder (docs/protocol.md "Connecting"). Read again before every connection
// attempt, since the user can change the port or regenerate the token any time.
namespace Stint.Keypad
{
    using System.Text.Json;

    public record ConnectionInfo(bool Enabled, int Port, string Token)
    {
        private const string FileName = "local-api.json";

        /// <summary>
        /// Stint's data folders: the installed app's, then a development build's.
        /// Windows: %APPDATA%\Stint   macOS: ~/Library/Application Support/Stint
        /// </summary>
        public static IReadOnlyList<string> DefaultFolders()
        {
            // `string baseDir = cond ? a : b` works like in JS.
            string baseDir = OperatingSystem.IsMacOS()
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "Application Support")
                : Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            return new[] { Path.Combine(baseDir, "Stint"), Path.Combine(baseDir, "Stint Dev") };
        }

        /// <summary>
        /// Read local-api.json from whichever folder has the most recently written
        /// one (that's the Stint that ran last). Null if there's none, or it's unreadable.
        /// </summary>
        public static ConnectionInfo? Find(IEnumerable<string> folders)
        {
            // LINQ (Select/Where/OrderByDescending) is like JS array methods (map/filter/sort).
            var newest = folders
                .Select(folder => Path.Combine(folder, FileName))
                .Where(File.Exists)
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();
            return newest == null ? null : Read(newest);
        }

        public static ConnectionInfo? Read(string path)
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                var root = doc.RootElement;
                // `out var x` hands back a second result through a variable, a C# idiom for "try" methods.
                bool enabled = !root.TryGetProperty("enabled", out var e) || e.ValueKind != JsonValueKind.False;
                if (!root.TryGetProperty("port", out var p) || !p.TryGetInt32(out int port) || port < 1 || port > 65535)
                {
                    return null;
                }
                if (!root.TryGetProperty("token", out var t) || t.GetString() is not { Length: > 0 } token)
                {
                    return null;
                }
                return new ConnectionInfo(enabled, port, token);
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException or InvalidOperationException)
            {
                // Stint may be rewriting the file right now; the next attempt reads it again.
                return null;
            }
        }
    }
}
