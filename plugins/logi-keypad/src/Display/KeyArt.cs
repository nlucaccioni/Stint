// SPDX-License-Identifier: MIT
// Draws the key images. Placeholder look until the real design arrives: keep all
// the colors and sizes here so restyling the keys means editing one file.
//
// Keys are square (80–116 px depending on the device). Sizes below are fractions
// of the key so they scale.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    internal static class KeyArt
    {
        private static readonly BitmapColor Background = new(20, 20, 20);
        private static readonly BitmapColor Text = new(240, 240, 240);
        private static readonly BitmapColor Muted = new(140, 140, 140);
        private static readonly BitmapColor StopRed = new(220, 70, 60);

        /// <summary>An idle project: its client's color as a bar on the left, the name in the middle.</summary>
        public static BitmapImage Project(int width, int height, ProjectEntry project)
        {
            using var b = new BitmapBuilder(width, height);
            b.Clear(Background);
            int bar = Math.Max(4, width / 14);
            b.FillRectangle(0, 0, bar, height, ColorOf(project.Color) ?? Muted);
            DrawLines(b, bar, project.Name, project.ClientName, Text, Muted);
            return b.ToImage();
        }

        /// <summary>A running project: filled with the client's color, with a second line (e.g. "Running").</summary>
        public static BitmapImage RunningProject(int width, int height, ProjectEntry project, string detail)
        {
            using var b = new BitmapBuilder(width, height);
            var rgb = Format.ParseHex(project.Color);
            var fill = ColorOf(project.Color) ?? Muted;
            // Pick black or white text, whichever reads better on the client's color.
            var ink = rgb.HasValue && Format.IsLight(rgb.Value) ? BitmapColor.Black : BitmapColor.White;
            b.Clear(fill);
            DrawLines(b, 0, project.Name, detail, ink, ink, emphasizeSecond: true);
            return b.ToImage();
        }

        /// <summary>A key with a label on top and a big value below (Stop, totals).</summary>
        public static BitmapImage Value(int width, int height, string label, string value, bool alert = false)
        {
            using var b = new BitmapBuilder(width, height);
            b.Clear(Background);
            DrawLines(b, 0, label, value, alert ? StopRed : Muted, Text, emphasizeSecond: true, labelFirst: true);
            return b.ToImage();
        }

        /// <summary>A plain text key ("Quick Switcher", "Choose a Project").</summary>
        public static BitmapImage Label(int width, int height, string text, bool muted = false)
        {
            using var b = new BitmapBuilder(width, height);
            b.Clear(Background);
            b.DrawText(text, 4, 0, width - 8, height, muted ? Muted : Text, FontSize(height, 0.15));
            return b.ToImage();
        }

        /// <summary>What every key shows while Stint can't be reached.</summary>
        public static BitmapImage Unavailable(int width, int height, ConnectionStatus status) =>
            Label(width, height, StatusText(status), muted: true);

        public static string StatusText(ConnectionStatus status) => status switch
        {
            ConnectionStatus.Disabled => "Keypad Off in Stint",
            ConnectionStatus.Incompatible => "Update Stint",
            ConnectionStatus.Unauthorized => "Reconnecting",
            _ => "Stint Offline",
        };

        /// <summary>
        /// Two lines of text. By default the first line (the name) is large and the
        /// second small; labelFirst puts a small label above a large value.
        /// </summary>
        private static void DrawLines(
            BitmapBuilder b, int left, string first, string second, BitmapColor firstColor, BitmapColor secondColor,
            bool emphasizeSecond = false, bool labelFirst = false)
        {
            int w = b.Width - left - 8, h = b.Height;
            int x = left + 4;
            int big = FontSize(h, 0.17), small = FontSize(h, 0.12);
            if (labelFirst)
            {
                b.DrawText(first, x, 0, w, h * 2 / 5, firstColor, small);
                b.DrawText(second, x, h * 2 / 5, w, h * 3 / 5 - h / 10, secondColor, FontSize(h, 0.2));
                return;
            }
            b.DrawText(first, x, 0, w, h * 3 / 5, firstColor, big);
            b.DrawText(second, x, h * 3 / 5 - h / 10, w, h * 2 / 5, secondColor, emphasizeSecond ? FontSize(h, 0.16) : small);
        }

        private static int FontSize(int height, double fraction) => Math.Max(9, (int)Math.Round(height * fraction));

        private static BitmapColor? ColorOf(string hex) =>
            Format.ParseHex(hex) is { } c ? new BitmapColor(c.R, c.G, c.B) : null;
    }
}
