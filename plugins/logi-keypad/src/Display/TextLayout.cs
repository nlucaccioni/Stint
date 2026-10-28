// SPDX-License-Identifier: MIT
// Breaks key text into lines that fit a width, with a cap on the number of lines.
// Text that doesn't fit ends with "…". Kept free of Logitech's SDK (the width of a
// piece of text comes in as a function) so it can be unit-tested.
namespace Stint.Keypad
{
    public static class TextLayout
    {
        public const string Ellipsis = "…";

        /// <param name="text">The text; "\n" forces a line break (e.g. "All\nProjects").</param>
        /// <param name="measure">Width of a piece of text, in pixels, at the font size being drawn.</param>
        /// <param name="maxWidth">Width of the box the text goes in.</param>
        /// <param name="maxLines">Most lines to use; the last one ends in "…" if text is left over.</param>
        public static IReadOnlyList<string> Wrap(string text, Func<string, float> measure, float maxWidth, int maxLines)
        {
            var paragraphs = text.Split('\n');
            var lines = new List<string>();
            for (int i = 0; i < paragraphs.Length; i++)
            {
                if (lines.Count == maxLines)
                {
                    // Out of lines with paragraphs left: end the last line with "…" (unless it already does).
                    if (!lines[^1].EndsWith(Ellipsis, StringComparison.Ordinal))
                    {
                        lines[^1] = WithEllipsis($"{lines[^1]} {string.Join(" ", paragraphs[i..])}", measure, maxWidth);
                    }
                    break;
                }
                lines.AddRange(WrapParagraph(paragraphs[i], measure, maxWidth, maxLines - lines.Count));
            }
            return lines;
        }

        /// <summary>One paragraph (no line breaks) wrapped at spaces.</summary>
        private static List<string> WrapParagraph(string text, Func<string, float> measure, float maxWidth, int maxLines)
        {
            var words = new Queue<string>(text.Split(' ', StringSplitOptions.RemoveEmptyEntries));
            var lines = new List<string>();
            var line = "";
            bool lastWasSplit = false; // the last full line ended mid-word

            while (words.Count > 0 && lines.Count < maxLines)
            {
                var word = words.Peek();
                var candidate = line.Length == 0 ? word : $"{line} {word}";
                if (measure(candidate) <= maxWidth)
                {
                    line = candidate;
                    words.Dequeue();
                }
                else if (line.Length > 0)
                {
                    lines.Add(line);
                    line = "";
                    lastWasSplit = false;
                }
                else
                {
                    // One word wider than the whole line: break it where it stops fitting.
                    var (head, tail) = SplitToFit(word, measure, maxWidth);
                    words.Dequeue();
                    lines.Add(head);
                    lastWasSplit = true;
                    if (tail.Length > 0)
                    {
                        // Put the rest of the word back at the front of the queue.
                        var rest = new Queue<string>(new[] { tail }.Concat(words));
                        words = rest;
                    }
                }
            }

            if (words.Count == 0)
            {
                if (line.Length > 0)
                {
                    lines.Add(line);
                }
                return lines;
            }

            // Out of lines with text left over: fill the last line with as much of the
            // rest as fits, ending in "…" ("Long Proj…", not just "Long…").
            var leftover = string.Join(" ", words);
            var last = lastWasSplit ? lines[^1] + leftover : $"{lines[^1]} {leftover}";
            lines[^1] = WithEllipsis(last, measure, maxWidth);
            return lines;
        }

        /// <summary>The longest start of `word` that fits, and the rest.</summary>
        private static (string Head, string Tail) SplitToFit(string word, Func<string, float> measure, float maxWidth)
        {
            int n = word.Length;
            while (n > 1 && measure(word[..n]) > maxWidth)
            {
                n--;
            }
            return (word[..n], word[n..]);
        }

        /// <summary>Shorten `text` from the end until it fits with "…" after it.</summary>
        private static string WithEllipsis(string text, Func<string, float> measure, float maxWidth)
        {
            var trimmed = text.TrimEnd();
            while (trimmed.Length > 0 && measure(trimmed + Ellipsis) > maxWidth)
            {
                trimmed = trimmed[..^1].TrimEnd();
            }
            return trimmed + Ellipsis;
        }
    }
}
