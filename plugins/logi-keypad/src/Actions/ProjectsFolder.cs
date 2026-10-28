// SPDX-License-Identifier: MIT
// "All Projects": a key that opens a page with a Project key (ProjectKeyCommand)
// for every active project in Stint. Pressing one starts it (or stops it if it's
// running) and closes the page. The page follows Stint's project list by itself.
//
// The page holds Project keys rather than the folder's own keys because Options+
// draws a folder's own keys inset on its grey folder tile, while Project keys are
// widgets and fill the whole key. The folder key itself can't avoid that tile
// (folders can't be widgets), and it always says "All Projects": Options+ only
// redraws a folder's key when the main page is shown again, never on request
// (tested every redraw call the SDK offers), so live info there would go stale.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class ProjectsFolder : PluginDynamicFolder
    {
        private IReadOnlyList<ProjectEntry>? _knownProjects;
        private bool _open;

        public ProjectsFolder()
        {
            this.DisplayName = "All Projects";
            this.Description = "Open a page with a key for every project.";
            // Listed in Options+ next to the Project keys.
            this.GroupName = "Projects";
        }

        private StintPlugin Owner => (StintPlugin)this.Plugin;

        public override Boolean Load()
        {
            this.Owner.ProjectsFolder = this;
            this.Owner.Stint.Changed += this.OnStintChanged;
            return true;
        }

        public override Boolean Unload()
        {
            this.Owner.Stint.Changed -= this.OnStintChanged;
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

        /// <summary>Back to the main page after a project is picked (called by ProjectKeyCommand).</summary>
        public void CloseIfOpen()
        {
            if (this._open)
            {
                this.Close();
            }
        }

        // --- the folder key ---

        // The image has its own label (see KeyArt.NoLabel).
        public override String GetButtonDisplayName(PluginImageSize imageSize) => KeyArt.NoLabel;

        public override BitmapImage GetButtonImage(PluginImageSize imageSize)
        {
            using var sizer = new BitmapBuilder(imageSize);
            return KeyArt.Label(sizer.Width, sizer.Height, "All Projects");
        }

        // --- the page ---

        /// <summary>
        /// One Project key per project. A page lists actions by name; for an action
        /// with a parameter that's "$plugin___action___parameter", built by ActionString.
        /// </summary>
        public override IEnumerable<String> GetButtonPressActionNames(DeviceType deviceType)
        {
            var action = typeof(ProjectKeyCommand).FullName!;
            return this.Owner.Stint.Projects.Select(p => ActionString.ToString(this.Plugin.Name, action, p.Id));
        }

        private void OnStintChanged()
        {
            // New, renamed, archived, or reordered projects: rebuild the page.
            var projects = this.Owner.Stint.Projects;
            if (this._knownProjects == null || !this._knownProjects.SequenceEqual(projects))
            {
                this._knownProjects = projects;
                this.ButtonActionNamesChanged();
            }
        }
    }
}
