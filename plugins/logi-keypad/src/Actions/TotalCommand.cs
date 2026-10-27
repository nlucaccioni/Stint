// SPDX-License-Identifier: MIT
// "Total": shows one of Stint's totals. Which one is picked per key in Logi
// Options+ from a short fixed list (the SDK's "parameters"). It's display-only:
// pressing it does nothing.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class TotalCommand : PluginDynamicCommand
    {
        private const string Today = "today";
        private const string Week = "week";
        private const string UnbilledTime = "unbilled-time";
        private const string UnbilledAmount = "unbilled-amount";

        private int _ticks;

        public TotalCommand()
            : base(displayName: "Total", description: "Show today's, this week's, or unbilled time.", groupName: "Totals")
        {
            this.AddParameter(Today, "Today", "Totals");
            this.AddParameter(Week, "This Week", "Totals");
            this.AddParameter(UnbilledTime, "Unbilled Time", "Totals");
            this.AddParameter(UnbilledAmount, "Unbilled Amount", "Totals");
        }

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

            // Stint sends totals when something changes and once a minute. While a
            // timer runs, count today and this week up in between, so they don't lag.
            long sinceState = state.Running != null
                ? (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - stint.StateReceivedAt) / 1000
                : 0;
            var totals = state.Totals;
            return actionParameter switch
            {
                Today => KeyArt.Value(w, h, "Today", Format.Duration(totals.TodaySeconds + sinceState)),
                Week => KeyArt.Value(w, h, "This Week", Format.Duration(totals.WeekSeconds + sinceState)),
                UnbilledTime => KeyArt.Value(w, h, "Unbilled", Format.Duration(totals.UnbilledSeconds)),
                UnbilledAmount => KeyArt.Value(w, h, "Unbilled", Format.Money(totals.UnbilledAmounts)),
                _ => KeyArt.Label(w, h, "Total", muted: true),
            };
        }

        // Totals show minutes, so redrawing every 15 seconds while a timer runs is plenty.
        private void OnTick()
        {
            if (this.Stint.State?.Running != null && ++this._ticks % 15 == 0)
            {
                this.ActionImageChanged();
            }
        }
    }
}
