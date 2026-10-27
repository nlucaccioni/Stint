// SPDX-License-Identifier: MIT
// Stint sends totals when something changes and once a minute. While a timer
// runs, this brings them up to the current second, so total keys count up live
// (docs/protocol.md, "Totals go stale between messages").
namespace Stint.Keypad
{
    public static class LiveTotals
    {
        /// <param name="secondsSinceState">Seconds since this state arrived.</param>
        public static Totals At(StintState state, long secondsSinceState)
        {
            var totals = state.Totals;
            var running = state.Running;
            if (running == null || secondsSinceState <= 0)
            {
                return totals;
            }

            long unbilledSeconds = totals.UnbilledSeconds;
            var amounts = totals.UnbilledAmounts;
            if (running.Billable)
            {
                unbilledSeconds += secondsSinceState;
                if (running.Rate is { } rate)
                {
                    long earned = (long)Math.Round(secondsSinceState * rate.Cents / 3600.0);
                    amounts = AddTo(amounts, new Money(rate.Currency, earned));
                }
            }

            // `with` copies a record, changing only the listed properties.
            return totals with
            {
                TodaySeconds = totals.TodaySeconds + secondsSinceState,
                WeekSeconds = totals.WeekSeconds + secondsSinceState,
                UnbilledSeconds = unbilledSeconds,
                UnbilledAmounts = amounts,
            };
        }

        /// <summary>Add money to the entry in its currency (or a new entry). Currencies never mix.</summary>
        private static IReadOnlyList<Money> AddTo(IReadOnlyList<Money> amounts, Money extra)
        {
            bool found = false;
            var result = amounts
                .Select(m =>
                {
                    if (m.Currency != extra.Currency)
                    {
                        return m;
                    }
                    found = true;
                    return m with { Cents = m.Cents + extra.Cents };
                })
                .ToList();
            if (!found)
            {
                result.Add(extra);
            }
            return result;
        }
    }
}
