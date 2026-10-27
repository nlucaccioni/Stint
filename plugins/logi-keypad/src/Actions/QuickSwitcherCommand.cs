// SPDX-License-Identifier: MIT
// "Quick Switcher": opens Stint's search palette on screen, to start any project.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class QuickSwitcherCommand : PluginDynamicCommand
    {
        public QuickSwitcherCommand()
            : base(displayName: "Quick Switcher", description: "Open Stint's quick switcher to start any project.", groupName: "Timer")
        {
        }

        private StintConnection Stint => ((StintPlugin)this.Plugin).Stint;

        protected override Boolean OnLoad()
        {
            ((StintPlugin)this.Plugin).Stint.Changed += this.ActionImageChanged;
            return true;
        }

        protected override Boolean OnUnload()
        {
            ((StintPlugin)this.Plugin).Stint.Changed -= this.ActionImageChanged;
            return true;
        }

        protected override void RunCommand(String actionParameter) => _ = this.Stint.OpenSwitcherAsync();

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            using var sizer = new BitmapBuilder(imageSize);
            var status = this.Stint.Status;
            return status == ConnectionStatus.Connected
                ? KeyArt.Label(sizer.Width, sizer.Height, "Quick Switcher")
                : KeyArt.Unavailable(sizer.Width, sizer.Height, status);
        }
    }
}
