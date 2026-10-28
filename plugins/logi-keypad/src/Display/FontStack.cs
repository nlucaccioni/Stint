// SPDX-License-Identifier: MIT
// Stint's font for the keys: Space Grotesk (SIL OFL 1.1), bundled
// inside the plugin's .dll (src/Fonts). The SDK's own text drawing can only use its
// built-in font, so key text is drawn here with SkiaSharp (the graphics library the
// SDK itself uses) and placed on the key as a small image.
//
// (Space Mono, which the app uses for times, is too wide for the keys.)
//
// The font comes as two files: basic Latin and extended Latin (accented letters).
// A character missing from both falls back to the SDK's built-in font, so no name
// ever shows empty boxes.
namespace Loupedeck.StintPlugin
{
    using System.Text;

    using SkiaSharp;

    internal sealed class FontStack
    {
        public static readonly FontStack Sans = Load("SpaceGrotesk-latin-400.ttf", "SpaceGrotesk-latin-ext-400.ttf");

        // In order of preference; the last is always the SDK's built-in font.
        private readonly SKTypeface[] _faces;

        private FontStack(SKTypeface[] faces) => this._faces = faces;

        private static FontStack Load(params string[] files)
        {
            var faces = new List<SKTypeface>();
            foreach (var file in files)
            {
                try
                {
                    // SKData.CreateCopy keeps its own copy of the bytes, so the font
                    // doesn't depend on the resource stream staying open.
                    using var data = SKData.CreateCopy(PluginResources.ReadBinaryFile(file));
                    if (SKTypeface.FromData(data) is { } face)
                    {
                        faces.Add(face);
                    }
                }
                catch (Exception ex)
                {
                    PluginLog.Error(ex, $"Couldn't load font {file}; using the built-in font for it");
                }
            }
            faces.Add(BitmapFonts.GetDefaultTypeface());
            return new FontStack(faces.ToArray());
        }

        /// <summary>Width of `text` at `size` px, the way Draw will draw it.</summary>
        public float Measure(string text, float size)
        {
            using var paint = new SKPaint { TextSize = size };
            float width = 0;
            foreach (var (run, face) in this.Runs(text))
            {
                paint.Typeface = face;
                width += paint.MeasureText(run);
            }
            return width;
        }

        /// <summary>
        /// One line of text, centered in a transparent `width` × `height` image,
        /// returned as PNG bytes for BitmapBuilder.DrawImage.
        /// </summary>
        public byte[] DrawLine(string text, int width, int height, float size, BitmapColor color)
        {
            using var bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul));
            using var canvas = new SKCanvas(bitmap);
            canvas.Clear(SKColors.Transparent);
            using var paint = new SKPaint
            {
                TextSize = size,
                IsAntialias = true,
                SubpixelText = true,
                Color = new SKColor(color.R, color.G, color.B, color.A),
            };

            // Center vertically on the main font's ascent and descent, so every line
            // of a family sits at the same height whatever letters it has.
            paint.Typeface = this._faces[0];
            var metrics = paint.FontMetrics;
            float baseline = ((height - (metrics.Descent - metrics.Ascent)) / 2) - metrics.Ascent;

            float x = (width - this.Measure(text, size)) / 2;
            foreach (var (run, face) in this.Runs(text))
            {
                paint.Typeface = face;
                canvas.DrawText(run, x, baseline, paint);
                x += paint.MeasureText(run);
            }

            using var image = SKImage.FromBitmap(bitmap);
            using var png = image.Encode(SKEncodedImageFormat.Png, 100);
            return png.ToArray();
        }

        /// <summary>Split text into runs that each use the first font that has all their characters.</summary>
        private IEnumerable<(string Run, SKTypeface Face)> Runs(string text)
        {
            var run = new StringBuilder();
            SKTypeface? current = null;
            // A Rune is one Unicode character, even ones that take two C# chars (like emoji).
            foreach (var rune in text.EnumerateRunes())
            {
                var face = this.FaceFor(rune.Value);
                if (current != null && face != current)
                {
                    yield return (run.ToString(), current);
                    run.Clear();
                }
                current = face;
                run.Append(rune.ToString());
            }
            if (current != null && run.Length > 0)
            {
                yield return (run.ToString(), current);
            }
        }

        private SKTypeface FaceFor(int codepoint)
        {
            foreach (var face in this._faces)
            {
                if (face.GetGlyph(codepoint) != 0)
                {
                    return face;
                }
            }
            return this._faces[^1];
        }
    }
}
