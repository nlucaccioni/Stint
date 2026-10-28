// SPDX-License-Identifier: MIT
// Draws the key images. Placeholder look until the real design arrives: keep all
// the colors and sizes here so restyling the keys means editing one file.
//
// Keys are square (80–116 px depending on the device). Sizes below are fractions
// of the key so they scale.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    using SkiaSharp;

    internal static class KeyArt
    {
        /// <summary>
        /// The name to give keys whose image already has its own label. Logi Options+
        /// prints a key's name over its image, and falls back to the action's name
        /// when the name is empty, so this is a single space (as the SpeedTest plugin
        /// does). Live keys are also widgets (see WidgetKeys) so Options+ doesn't
        /// offer icon editing, which would freeze them: editing saves a snapshot of
        /// the key and Options+ stops asking the plugin for new images.
        /// </summary>
        public const string NoLabel = " ";

        private static readonly BitmapColor Background = new(20, 20, 20);
        private static readonly BitmapColor Text = new(240, 240, 240);
        private static readonly BitmapColor Muted = new(140, 140, 140);

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

        /// <summary>A key with a label on top and a big value below (totals).</summary>
        public static BitmapImage Value(int width, int height, string label, string value)
        {
            using var b = new BitmapBuilder(width, height);
            b.Clear(Background);
            DrawLines(b, 0, label, value, Muted, Text, emphasizeSecond: true, labelFirst: true);
            return b.ToImage();
        }

        /// <summary>A plain text key ("Quick Switcher", "Choose a Project").</summary>
        public static BitmapImage Label(int width, int height, string text, bool muted = false)
        {
            using var b = new BitmapBuilder(width, height);
            b.Clear(Background);
            DrawText(b, text, 4, 0, width - 8, height, muted ? Muted : Text, FontSize(height, 0.15), maxLines: 2);
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
                DrawText(b, first, x, 0, w, h * 2 / 5, firstColor, small, maxLines: 1);
                DrawText(b, second, x, h * 2 / 5, w, h * 3 / 5 - h / 10, secondColor, FontSize(h, 0.2), maxLines: 1, shrinkToFit: true);
                return;
            }
            // Name and detail move down together, so the pair looks centered rather
            // than measuring centered (it read high on the Keypad).
            int nudge = (int)Math.Round(h * OpticalNudge);
            DrawText(b, first, x, nudge, w, h * 3 / 5, firstColor, big, maxLines: 2);
            DrawText(b, second, x, (h * 3 / 5) - (h / 10) + nudge, w, h * 2 / 5, secondColor, emphasizeSecond ? FontSize(h, 0.16) : small, maxLines: 1);
        }

        // How far the two lines on project keys move down, as a share of the key height (4 px at 143).
        private const double OpticalNudge = 0.03;

        // Space between lines when text wraps, as a multiple of the font size.
        private const double LineSpacing = 1.2;

        // Values shrink to fit before they'd be cut off, but no smaller than this share of their size.
        private const double MinShrink = 0.6;

        // The font the SDK draws text in, for measuring. Owned by the SDK: don't dispose it.
        private static readonly SKTypeface Typeface = BitmapFonts.GetDefaultTypeface();

        /// <summary>
        /// Text centered in a box. It wraps at spaces onto at most `maxLines` lines,
        /// and anything that still doesn't fit ends in "…". With `shrinkToFit`, a
        /// one-line value gets smaller instead (down to MinShrink) before it's cut.
        /// The lines are placed here rather than by the SDK, so the spacing between
        /// them is ours and the block is centered exactly.
        /// </summary>
        private static void DrawText(
            BitmapBuilder b, string text, int x, int y, int width, int height, BitmapColor color, int fontSize,
            int maxLines, bool shrinkToFit = false)
        {
            // `using` disposes the paint when the method ends, like a try/finally.
            using var paint = new SKPaint { Typeface = Typeface, TextSize = fontSize };
            // A couple of pixels of slack: the SDK's own drawing can differ slightly from this measurement.
            float fitWidth = width - 2;
            if (shrinkToFit)
            {
                int smallest = (int)Math.Round(fontSize * MinShrink);
                while (fontSize > smallest && paint.MeasureText(text) > fitWidth)
                {
                    fontSize--;
                    paint.TextSize = fontSize;
                }
            }

            var lines = TextLayout.Wrap(text, s => paint.MeasureText(s), fitWidth, maxLines);
            int lineHeight = (int)Math.Round(fontSize * LineSpacing);
            int top = y + (height - (lines.Count * lineHeight)) / 2;
            for (int i = 0; i < lines.Count; i++)
            {
                // Each line centered in its own row, one line height tall.
                b.DrawText(lines[i], x, top + (i * lineHeight), width, lineHeight, color, fontSize);
            }
        }

        private static int FontSize(int height, double fraction) => Math.Max(9, (int)Math.Round(height * fraction));

        private static BitmapColor? ColorOf(string hex) =>
            Format.ParseHex(hex) is { } c ? new BitmapColor(c.R, c.G, c.B) : null;
    }
}
