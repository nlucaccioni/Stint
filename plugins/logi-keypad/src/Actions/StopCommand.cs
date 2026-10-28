// SPDX-License-Identifier: MIT
// "Now Running": shows the running project in its client's color with the live
// time, or "No Timer". Pressing it stops the timer. (Still named StopCommand so
// keys set up when it was "Stop Timer" keep working.)
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class StopCommand : PluginDynamicCommand
    {
        public StopCommand()
            : base(displayName: "Now Running", description: "Shows the running timer. Press to stop it.", groupName: "Timer")
        {
            // A widget: Options+ shows the plugin's image as is and offers no icon
            // editing, which would freeze the key (see KeyArt.NoLabel).
            this.IsWidget = true;
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

        // The image has its own label (see KeyArt.NoLabel).
        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize) => KeyArt.NoLabel;

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
            var project = running == null ? null : stint.Projects.FirstOrDefault(p => p.Id == running.ProjectId);
            if (running == null || project == null)
            {
                return KeyArt.Label(w, h, "No Timer", muted: true);
            }
            long elapsed = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - running.StartedAt) / 1000;
            return KeyArt.RunningProject(w, h, project, Format.Elapsed(elapsed));
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
