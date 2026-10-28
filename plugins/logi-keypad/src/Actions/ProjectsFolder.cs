// SPDX-License-Identifier: MIT
// "Projects": a key that opens a page of keys, one per active project in Stint.
// Unlike Project Timer keys, the plugin draws every key on that page itself, so
// they show the live state: the running project fills with its client's color and
// counts up. Pressing a project starts it (or stops it if it's running) and closes
// the page. The page follows Stint's project list by itself; nothing to set up.
//
// The folder key itself always says "Projects": Logi Options+ only redraws it when
// the main page is shown again, never on request (tested every redraw call the SDK
// offers), so live info there would go stale. The Now Running key shows what's running.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class ProjectsFolder : PluginDynamicFolder
    {
        private IReadOnlyList<ProjectEntry>? _knownProjects;
        private bool _open;

        public ProjectsFolder()
        {
            this.DisplayName = "Projects";
            this.Description = "Open a page with a key for every project.";
            this.GroupName = "Timer";
        }

        private StintConnection Stint => ((StintPlugin)this.Plugin).Stint;

        public override Boolean Load()
        {
            var plugin = (StintPlugin)this.Plugin;
            plugin.Stint.Changed += this.OnStintChanged;
            plugin.Tick += this.OnTick;
            return true;
        }

        public override Boolean Unload()
        {
            var plugin = (StintPlugin)this.Plugin;
            plugin.Stint.Changed -= this.OnStintChanged;
            plugin.Tick -= this.OnTick;
            return true;
        }

        // The SDK adds its own Back (and page) keys in the button area.
        public override PluginDynamicFolderNavigation GetNavigationArea(DeviceType _) => PluginDynamicFolderNavigation.ButtonArea;

        public override Boolean Activate()
        {
            this._open = true;
            return base.Activate();
        }

        public override Boolean Deactivate()
        {
            this._open = false;
            return base.Deactivate();
        }

        // --- the folder key ---

        // The image has its own label (see KeyArt.NoLabel).
        public override String GetButtonDisplayName(PluginImageSize imageSize) => KeyArt.NoLabel;

        public override BitmapImage GetButtonImage(PluginImageSize imageSize)
        {
            using var sizer = new BitmapBuilder(imageSize);
            return KeyArt.Label(sizer.Width, sizer.Height, "Projects");
        }

        // --- the page ---

        /// <summary>The keys on the page: one command per project, named after its id.</summary>
        public override IEnumerable<String> GetButtonPressActionNames(DeviceType deviceType) =>
            this.Stint.Projects.Select(p => this.CreateCommandName(p.Id));

        // The image has its own label (see KeyArt.NoLabel).
        public override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize) => KeyArt.NoLabel;

        public override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            using var sizer = new BitmapBuilder(imageSize);
            int w = sizer.Width, h = sizer.Height;
            var stint = this.Stint;
            if (stint.Status != ConnectionStatus.Connected)
            {
                return KeyArt.Unavailable(w, h, stint.Status);
            }
            var project = stint.Projects.FirstOrDefault(p => p.Id == actionParameter);
            var running = stint.State?.Running;
            if (project != null && running != null && running.ProjectId == project.Id)
            {
                return KeyArt.RunningProject(w, h, project, Format.Elapsed(ElapsedSeconds(running)));
            }
            return ProjectKey.Draw(project, ProjectKey.Idle, w, h);
        }

        public override void RunCommand(String actionParameter)
        {
            if (String.IsNullOrEmpty(actionParameter))
            {
                return;
            }
            _ = this.Stint.ToggleTimerAsync(actionParameter);
            // Back to the main page, where Now Running shows what's running.
            this.Close();
        }

        private static long ElapsedSeconds(RunningTimer running) =>
            (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - running.StartedAt) / 1000;

        private void OnStintChanged()
        {
            // New, renamed, archived, or reordered projects: rebuild the page.
            var projects = this.Stint.Projects;
            if (this._knownProjects == null || !this._knownProjects.SequenceEqual(projects))
            {
                this._knownProjects = projects;
                this.ButtonActionNamesChanged();
            }
            this.Redraw();
        }

        // Once a second while a timer runs: the running time on the page.
        private void OnTick()
        {
            if (this.Stint.State?.Running != null)
            {
                this.Redraw();
            }
        }

        private void Redraw()
        {
            if (this._open)
            {
                foreach (var p in this.Stint.Projects)
                {
                    this.CommandImageChanged(p.Id);
                }
            }
        }
    }
}
