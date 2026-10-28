// SPDX-License-Identifier: MIT
namespace Stint.Keypad.Tests
{
    public class TextLayoutTests
    {
        // Every character 10 px wide, so a 100 px line fits 10 characters.
        private static float Measure(string s) => s.Length * 10f;

        private static IReadOnlyList<string> Wrap(string text, int maxLines = 2) =>
            TextLayout.Wrap(text, Measure, 100, maxLines);

        [Fact]
        public void KeepsShortTextOnOneLine() => Assert.Equal(["Branding"], Wrap("Branding"));

        [Fact]
        public void WrapsAtSpaces() => Assert.Equal(["Quick", "Switcher"], Wrap("Quick Switcher"));

        [Fact]
        public void FillsEachLineBeforeWrapping() =>
            Assert.Equal(["Keypad Off", "in Stint"], Wrap("Keypad Off in Stint"));

        [Fact]
        public void EndsWithAnEllipsisWhenTextIsLeftOver() =>
            Assert.Equal(["Really", "Long Proj…"], Wrap("Really Long Project Name For Testing"));

        [Fact]
        public void AddsNoEllipsisWhenEverythingFits() =>
            Assert.Equal(["Website", "redesign"], Wrap("Website redesign"));

        [Fact]
        public void BreaksAWordTooLongForAWholeLine() =>
            Assert.Equal(["Supercalif", "ragilisti…"], Wrap("Supercalifragilisticexpialidocious"));

        [Fact]
        public void TruncatesSingleLineText() =>
            Assert.Equal(["Acme Stud…"], Wrap("Acme Studio Holdings", maxLines: 1));

        [Fact]
        public void IgnoresExtraSpaces() => Assert.Equal(["Quick", "Switcher"], Wrap("  Quick   Switcher "));

        [Fact]
        public void HandlesEmptyText() => Assert.Empty(Wrap(""));

        [Fact]
        public void BreaksAtExplicitLineBreaks() => Assert.Equal(["All", "Projects"], Wrap("All\nProjects"));

        [Fact]
        public void EndsWithAnEllipsisWhenLineBreaksRunOut() =>
            Assert.Equal(["One", "Two Three…"], Wrap("One\nTwo\nThree Four"));
    }
}
