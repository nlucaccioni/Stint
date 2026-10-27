// SPDX-License-Identifier: MIT
// Total keys: Today, This Week, Unbilled Time, Unbilled Amount. Each is its own
// action (rather than one action with a choice) so there's nothing to pick in
// Logi Options+. They're display-only: pressing them does nothing.
//
// C# notes: `abstract` classes can't be used directly, only extended, like a base
// class whose subclasses fill in the blanks (the `abstract` members).
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public abstract class TotalCommand : PluginDynamicCommand
    {
        private int _ticks;

        protected TotalCommand(string displayName, string description)
            : base(displayName: displayName, description: description, groupName: "Totals")
        {
        }

        /// <summary>The small label above the value.</summary>
        protected abstract string Label { get; }

        /// <summary>The value to show, from totals brought up to the current second.</summary>
        protected abstract string Value(Totals totals);

        private StintConnection Stint => ((StintPlugin)this.Plugin).Stint;

        protected override Boolean OnLoad()
        {
            var plugin = (StintPlugin)this.Plugin;
            plugin.Stint.Changed += this.ActionImageChanged;
            plugin.Tick += this.OnTick;
            return true;
        }

        protected override Boolean OnUnload()
        {
            var plugin = (StintPlugin)this.Plugin;
            plugin.Stint.Changed -= this.ActionImageChanged;
            plugin.Tick -= this.OnTick;
            return true;
        }

        protected override void RunCommand(String actionParameter)
        {
        }

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            using var sizer = new BitmapBuilder(imageSize);
            int w = sizer.Width, h = sizer.Height;
            var stint = this.Stint;
            var state = stint.State;
            if (stint.Status != ConnectionStatus.Connected || state == null)
            {
                return KeyArt.Unavailable(w, h, stint.Status);
            }
            long sinceState = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - stint.StateReceivedAt) / 1000;
            return KeyArt.Value(w, h, this.Label, this.Value(LiveTotals.At(state, sinceState)));
        }

        // Totals show whole minutes and dollars, so redrawing every 5 seconds while a timer runs is plenty.
        private void OnTick()
        {
            if (this.Stint.State?.Running != null && ++this._ticks % 5 == 0)
            {
                this.ActionImageChanged();
            }
        }
    }

    public class TodayTotalCommand : TotalCommand
    {
        public TodayTotalCommand()
            : base("Today", "Time recorded today.")
        {
        }

        protected override string Label => "Today";

        protected override string Value(Totals totals) => Format.Duration(totals.TodaySeconds);
    }

    public class WeekTotalCommand : TotalCommand
    {
        public WeekTotalCommand()
            : base("This Week", "Time recorded this week.")
        {
        }

        protected override string Label => "This Week";

        protected override string Value(Totals totals) => Format.Duration(totals.WeekSeconds);
    }

    public class UnbilledTimeCommand : TotalCommand
    {
        public UnbilledTimeCommand()
            : base("Unbilled Time", "Billable time not yet billed.")
        {
        }

        protected override string Label => "Unbilled";

        protected override string Value(Totals totals) => Format.Duration(totals.UnbilledSeconds);
    }

    public class UnbilledAmountCommand : TotalCommand
    {
        public UnbilledAmountCommand()
            : base("Unbilled Amount", "What your unbilled time is worth.")
        {
        }

        protected override string Label => "Unbilled";

        protected override string Value(Totals totals) => Format.Money(totals.UnbilledAmounts);
    }
}
