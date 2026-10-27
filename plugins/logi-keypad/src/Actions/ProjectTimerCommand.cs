// SPDX-License-Identifier: MIT
// "Project Timer": a key that starts, switches to, or stops one project's timer.
// The project is picked per key from a dropdown in Logi Options+ (the SDK's
// "Action Editor"), filled from Stint's project list.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class ProjectTimerCommand : ActionEditorCommand
    {
        // The dropdown's name. Logi Options+ saves each key's choice under it.
        private const string ProjectControl = "project";

        // The project list last seen, to tell when the dropdown needs a refresh.
        // Stint sends a whole new list whenever anything in it changes.
        private IReadOnlyList<ProjectEntry>? _knownProjects;

        public ProjectTimerCommand()
        {
            this.DisplayName = "Project Timer";
            this.Description = "Start, switch to, or stop a project's timer.";
            this.GroupName = "Timer";

            this.ActionEditor.AddControlEx(
                new ActionEditorListbox(name: ProjectControl, labelText: "Project")
                    .SetPlaceholder("Choose a project")
                    .SetRequired());
            // `+=` subscribes to an event, like addEventListener.
            this.ActionEditor.ListboxItemsRequested += this.OnListboxItemsRequested;
        }

        // `this.Plugin` is the SDK's base type; cast it to ours to reach the connection.
        private StintConnection Stint => ((StintPlugin)this.Plugin).Stint;

        protected override Boolean OnLoad()
        {
            var plugin = (StintPlugin)this.Plugin;
            plugin.Stint.Changed += this.OnStintChanged;
            plugin.Tick += this.OnTick;
            return true;
        }

        protected override Boolean OnUnload()
        {
            var plugin = (StintPlugin)this.Plugin;
            plugin.Stint.Changed -= this.OnStintChanged;
            plugin.Tick -= this.OnTick;
            return true;
        }

        /// <summary>Fill the dropdown: "Client · Project", in Stint's order.</summary>
        private void OnListboxItemsRequested(Object? sender, ActionEditorListboxItemsRequestedEventArgs e)
        {
            if (e.ControlName != ProjectControl)
            {
                return;
            }
            var projects = this.Stint.Projects;
            foreach (var p in projects)
            {
                e.AddItem(name: p.Id, displayName: $"{p.ClientName} · {p.Name}", description: null);
            }
            PluginLog.Info($"Project dropdown filled with {projects.Count} projects");
        }

        protected override Boolean RunCommand(ActionEditorActionParameters actionParameters)
        {
            if (actionParameters.TryGetString(ProjectControl, out var projectId) && !String.IsNullOrEmpty(projectId))
            {
                // `_ =` starts the send without waiting for it; the key redraws when Stint's new state arrives.
                _ = this.Stint.ToggleTimerAsync(projectId);
            }
            return true;
        }

        protected override String GetCommandDisplayName(ActionEditorActionParameters actionParameters) =>
            this.FindProject(actionParameters)?.Name ?? "Project Timer";

        protected override BitmapImage GetCommandImage(ActionEditorActionParameters actionParameters, Int32 imageWidth, Int32 imageHeight)
        {
            var stint = this.Stint;
            var state = stint.State;
            if (stint.Status != ConnectionStatus.Connected || state == null)
            {
                return KeyArt.Unavailable(imageWidth, imageHeight, stint.Status);
            }
            if (!actionParameters.TryGetString(ProjectControl, out var projectId) || String.IsNullOrEmpty(projectId))
            {
                return KeyArt.Label(imageWidth, imageHeight, "Choose a Project", muted: true);
            }
            var project = this.FindProject(actionParameters);
            if (project == null)
            {
                // Archived or deleted in Stint since this key was set up.
                return KeyArt.Label(imageWidth, imageHeight, "Project Unavailable", muted: true);
            }
            if (state.Running?.ProjectId == project.Id)
            {
                long elapsed = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - state.Running.StartedAt) / 1000;
                return KeyArt.RunningProject(imageWidth, imageHeight, project, elapsed);
            }
            return KeyArt.Project(imageWidth, imageHeight, project);
        }

        private ProjectEntry? FindProject(ActionEditorActionParameters actionParameters) =>
            actionParameters.TryGetString(ProjectControl, out var id)
                ? this.Stint.Projects.FirstOrDefault(p => p.Id == id)
                : null;

        private void OnStintChanged()
        {
            // New projects, renames, or a different order: refresh the dropdown if it's open.
            var projects = this.Stint.Projects;
            if (!ReferenceEquals(this._knownProjects, projects))
            {
                this._knownProjects = projects;
                this.ActionEditor.ListboxItemsChanged(ProjectControl);
            }
            this.ActionImageChanged();
        }

        // Once a second: only a running key's elapsed time changes, so skip redrawing otherwise.
        private void OnTick()
        {
            if (this.Stint.State?.Running != null)
            {
                this.ActionImageChanged();
            }
        }
    }
}
