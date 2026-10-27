// SPDX-License-Identifier: MIT
// "Stop Timer": stops whatever is running. Shows the running time, or a muted
// "Stop" when nothing is running.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class StopCommand : PluginDynamicCommand
    {
        public StopCommand()
            : base(displayName: "Stop Timer", description: "Stop the running timer.", groupName: "Timer")
        {
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

        protected override void RunCommand(String actionParameter) => _ = this.Stint.StopTimerAsync();

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            // PluginImageSize is an enum (Width90, Width116...); BitmapBuilder knows the pixel size.
            using var sizer = new BitmapBuilder(imageSize);
            int w = sizer.Width, h = sizer.Height;

            var stint = this.Stint;
            if (stint.Status != ConnectionStatus.Connected)
            {
                return KeyArt.Unavailable(w, h, stint.Status);
            }
            var running = stint.State?.Running;
            if (running == null)
            {
                return KeyArt.Label(w, h, "Stop", muted: true);
            }
            long elapsed = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - running.StartedAt) / 1000;
            return KeyArt.Value(w, h, "Stop", Format.Elapsed(elapsed), alert: true);
        }

        private void OnTick()
        {
            if (this.Stint.State?.Running != null)
            {
                this.ActionImageChanged();
            }
        }
    }
}
