// SPDX-License-Identifier: MIT
namespace Stint.Keypad.Tests
{
    public class LiveTotalsTests
    {
        private static readonly Totals Base = new(
            TodaySeconds: 3600,
            WeekSeconds: 7200,
            UnbilledSeconds: 1800,
            UnbilledAmounts: [new Money("USD", 5000)]);

        private static StintState State(RunningTimer? running) => new(running, [], Base);

        private static RunningTimer Running(bool billable, Money? rate) =>
            new("s1", "p1", "c1", 0, billable, rate);

        [Fact]
        public void LeavesTotalsAloneWithNothingRunning()
        {
            Assert.Equal(Base, LiveTotals.At(State(null), 60));
        }

        [Fact]
        public void CountsABillableTimerUpEverywhere()
        {
            // $150/h for 2 minutes = $5.00.
            var live = LiveTotals.At(State(Running(true, new Money("USD", 15_000))), 120);
            Assert.Equal(3720, live.TodaySeconds);
            Assert.Equal(7320, live.WeekSeconds);
            Assert.Equal(1920, live.UnbilledSeconds);
            Assert.Equal([new Money("USD", 5500)], live.UnbilledAmounts);
        }

        [Fact]
        public void CountsANonBillableTimerOnlyTowardTodayAndWeek()
        {
            var live = LiveTotals.At(State(Running(false, new Money("USD", 15_000))), 120);
            Assert.Equal(3720, live.TodaySeconds);
            Assert.Equal(1800, live.UnbilledSeconds);
            Assert.Equal([new Money("USD", 5000)], live.UnbilledAmounts);
        }

        [Fact]
        public void CountsBillableTimeWithNoRateWithoutChangingAmounts()
        {
            var live = LiveTotals.At(State(Running(true, null)), 60);
            Assert.Equal(1860, live.UnbilledSeconds);
            Assert.Equal([new Money("USD", 5000)], live.UnbilledAmounts);
        }

        [Fact]
        public void KeepsCurrenciesApart()
        {
            // €90/h for 1 minute = €1.50, added as its own entry.
            var live = LiveTotals.At(State(Running(true, new Money("EUR", 9000))), 60);
            Assert.Equal([new Money("USD", 5000), new Money("EUR", 150)], live.UnbilledAmounts);
        }

        [Fact]
        public void ReadsTheNewFieldsFromStint()
        {
            var message = Protocol.Parse("""
                {"type":"state","favorites":[],
                 "running":{"sessionId":"s","projectId":"p","clientId":"c","startedAt":1,
                            "billable":true,"rate":{"currency":"USD","cents":15000}},
                 "totals":{"todaySeconds":0,"weekSeconds":0,"unbilledSeconds":0,"unbilledAmounts":[]}}
                """);
            Assert.True(message?.State?.Running?.Billable);
            Assert.Equal(new Money("USD", 15_000), message?.State?.Running?.Rate);
        }

        [Fact]
        public void TreatsAnOlderStintsTimerAsNotBillable()
        {
            var message = Protocol.Parse("""
                {"type":"state","favorites":[],
                 "running":{"sessionId":"s","projectId":"p","clientId":"c","startedAt":1},
                 "totals":{"todaySeconds":0,"weekSeconds":0,"unbilledSeconds":0,"unbilledAmounts":[]}}
                """);
            Assert.False(message?.State?.Running?.Billable);
            Assert.Null(message?.State?.Running?.Rate);
        }
    }
}
