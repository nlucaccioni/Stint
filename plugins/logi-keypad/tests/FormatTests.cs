// SPDX-License-Identifier: MIT
namespace Stint.Keypad.Tests
{
    public class FormatTests
    {
        [Theory]
        [InlineData(0, "0:00")]
        [InlineData(65, "1:05")]
        [InlineData(3599, "59:59")]
        [InlineData(3600, "1:00:00")]
        [InlineData(36_125, "10:02:05")]
        [InlineData(-5, "0:00")]
        public void Elapsed(long seconds, string expected) => Assert.Equal(expected, Format.Elapsed(seconds));

        [Theory]
        [InlineData(0, "0m")]
        [InlineData(59, "0m")]
        [InlineData(45 * 60, "45m")]
        [InlineData(3 * 3600, "3h")]
        [InlineData(3 * 3600 + 20 * 60, "3h 20m")]
        [InlineData(112 * 3600 + 5 * 60, "112h")]
        public void Duration(long seconds, string expected) => Assert.Equal(expected, Format.Duration(seconds));

        [Fact]
        public void Money()
        {
            Assert.Equal("No Rate", Format.Money([]));
            Assert.Equal("$4,026", Format.Money([new Money("USD", 402_623)]));
            Assert.Equal("$4,027", Format.Money([new Money("USD", 402_650)]));
            Assert.Equal("¥12,000", Format.Money([new Money("JPY", 12_000)]));
            Assert.Equal("1,500 CHF", Format.Money([new Money("CHF", 150_000)]));
            // The largest amount first, with a count of the other currencies.
            Assert.Equal("€900 +1", Format.Money([new Money("USD", 10_000), new Money("EUR", 90_000)]));
        }

        [Fact]
        public void Colors()
        {
            Assert.Equal((0x33, 0x66, 0x99), Format.ParseHex("#336699"));
            Assert.Null(Format.ParseHex("336699"));
            Assert.Null(Format.ParseHex("#zzzzzz"));
            Assert.Null(Format.ParseHex(null));
            Assert.True(Format.IsLight((250, 220, 90)));
            Assert.False(Format.IsLight((30, 60, 120)));
        }
    }
}
