// SPDX-License-Identifier: MIT
// "Project": a one-press key for one project, drawn live. In Logi Options+ every
// active project is listed under Projects > Client > Project; dragging one onto a
// key binds that key to it. Idle, the key shows the client's color bar and the
// name; running, it fills with the client's color and counts up. Press: start,
// switch to, or stop that project. The All Projects page (ProjectsFolder) is made
// of these keys too.
//
// How it's built (learned by testing on the MX Keypad):
// - Each project is a "parameter" of this one action. For Options+ to list the
//   parameters, the action must use the parameterless base constructor (the other
//   one makes a single fixed action) and add them in its constructor.
// - Group names nest with "###" ("Projects###Acme Studio"), as the Litra plugin
//   nests its lights.
// - It's a widget, so Options+ draws the plugin's image live and offers no icon
//   editing (editing would freeze the key).
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class ProjectKeyCommand : PluginDynamicCommand
    {
        private IReadOnlyList<ProjectEntry>? _knownProjects;

        public ProjectKeyCommand()
            : base()
        {
            this.DisplayName = "Project";
            this.Description = "Start, switch to, or stop this project's timer.";
            this.GroupName = "Projects";
            this.IsWidget = true;
            // The plugin can't be reached yet, so use the list saved from the last
            // run (see StintPlugin.SavedProjects). Stint's live list replaces it.
            this.SetProjects(StintPlugin.SavedProjects);
        }

        private StintPlugin Owner => (StintPlugin)this.Plugin;

        private StintConnection Stint => this.Owner.Stint;

        protected override Boolean OnLoad()
        {
            this.Stint.Changed += this.OnStintChanged;
            this.Owner.Tick += this.OnTick;
            this.OnStintChanged();
            return true;
        }

        protected override Boolean OnUnload()
        {
            this.Stint.Changed -= this.OnStintChanged;
            this.Owner.Tick -= this.OnTick;
            return true;
        }

        protected override void RunCommand(String actionParameter)
        {
            if (!String.IsNullOrEmpty(actionParameter))
            {
                _ = this.Stint.ToggleTimerAsync(actionParameter);
                // If this key is on the All Projects page, go back to the main page.
                this.Owner.ProjectsFolder?.CloseIfOpen();
            }
        }

        // The image has its own label (see KeyArt.NoLabel).
        protected override String GetCommandDisplayName(String actionParameter, PluginImageSize imageSize) => KeyArt.NoLabel;

        protected override BitmapImage GetCommandImage(String actionParameter, PluginImageSize imageSize)
        {
            using var sizer = new BitmapBuilder(imageSize);
            return ProjectKey.Draw(this.Stint, actionParameter, sizer.Width, sizer.Height);
        }

        private void OnStintChanged()
        {
            // New, renamed, archived, or reordered projects: update the list in Options+.
            var projects = this.Stint.Projects;
            if (this._knownProjects == null || !this._knownProjects.SequenceEqual(projects))
            {
                this.SetProjects(projects);
                this.ParametersChanged();
            }
            this.ActionImageChanged();
        }

        /// <summary>One parameter per project, named by its id (what Options+ saves per key).</summary>
        private void SetProjects(IReadOnlyList<ProjectEntry> projects)
        {
            this._knownProjects = projects;
            this.RemoveAllParameters();
            foreach (var p in projects)
            {
                this.AddParameter(p.Id, p.Name, $"Projects###{p.ClientName}");
            }
        }

        // Once a second while a timer runs, for the live time on the running key.
        private void OnTick()
        {
            if (this.Stint.State?.Running != null)
            {
                this.ActionImageChanged();
            }
        }
    }
}
