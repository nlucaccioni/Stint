// SPDX-License-Identifier: MIT
// Text shown on the keys: elapsed times, totals, money, and colors. Kept apart
// from the drawing code (which needs Logitech's SDK) so it can be unit-tested.
namespace Stint.Keypad
{
    using System.Globalization;

    public static class Format
    {
        /// <summary>A running timer: "12:34" under an hour, then "1:23:45".</summary>
        public static string Elapsed(long seconds)
        {
            seconds = Math.Max(0, seconds);
            long h = seconds / 3600, m = seconds / 60 % 60, s = seconds % 60;
            // $"{m:00}" pads to two digits, like String(m).padStart(2, '0').
            return h > 0 ? $"{h}:{m:00}:{s:00}" : $"{m}:{s:00}";
        }

        /// <summary>A total: "45m", "3h 20m", "112h".</summary>
        public static string Duration(long seconds)
        {
            long minutes = Math.Max(0, seconds) / 60;
            long h = minutes / 60, m = minutes % 60;
            if (h == 0)
            {
                return $"{m}m";
            }
            return h >= 100 || m == 0 ? $"{h}h" : $"{h}h {m}m";
        }

        /// <summary>
        /// Unbilled amounts, one per currency: "$4,026", or "$4,026 +1" when there
        /// are amounts in other currencies too. Whole units only; keys are small.
        /// </summary>
        public static string Money(IReadOnlyList<Money> amounts)
        {
            if (amounts.Count == 0)
            {
                return "No Rate";
            }
            var first = amounts.OrderByDescending(a => a.Cents).First();
            var text = Amount(first);
            return amounts.Count > 1 ? $"{text} +{amounts.Count - 1}" : text;
        }

        public static string Amount(Money money)
        {
            // Stint stores money in the currency's smallest unit: cents for USD,
            // but whole yen for JPY (no minor unit).
            decimal units = ZeroDecimalCurrencies.Contains(money.Currency) ? money.Cents : money.Cents / 100m;
            var number = Math.Round(units, MidpointRounding.AwayFromZero).ToString("#,0", CultureInfo.InvariantCulture);
            return Symbols.TryGetValue(money.Currency, out var symbol) ? symbol + number : $"{number} {money.Currency}";
        }

        /// <summary>"#336699" to (r, g, b), or null if it isn't a hex color.</summary>
        public static (int R, int G, int B)? ParseHex(string? hex)
        {
            if (hex is not { Length: 7 } || hex[0] != '#' ||
                !int.TryParse(hex.AsSpan(1), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int rgb))
            {
                return null;
            }
            return ((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
        }

        /// <summary>True when black text reads better than white on this color.</summary>
        public static bool IsLight((int R, int G, int B) c) =>
            (0.299 * c.R) + (0.587 * c.G) + (0.114 * c.B) > 160;

        private static readonly HashSet<string> ZeroDecimalCurrencies = new() { "JPY", "KRW", "CLP", "ISK", "VND" };

        private static readonly Dictionary<string, string> Symbols = new()
        {
            ["USD"] = "$", ["CAD"] = "$", ["AUD"] = "$", ["NZD"] = "$",
            ["EUR"] = "€", ["GBP"] = "£", ["JPY"] = "¥", ["INR"] = "₹", ["KRW"] = "₩",
        };
    }
}
