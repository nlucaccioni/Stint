// SPDX-License-Identifier: MIT
// "Project Timer": a key that starts, switches to, or stops one project's timer.
// The project is picked per key from a dropdown in Logi Options+ (the SDK's
// "Action Editor"), filled from Stint's project list.
//
// How the key shows what's happening (learned by testing on the MX Keypad):
// Logi Options+ asks for one image per state when the key is set up, then reuses
// them; it never asks again. So the key has three states (Idle, Running, Stint
// Offline), and the plugin switches each key to the right state as Stint changes.
// A live elapsed time isn't possible on this key; the Stop key shows it.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    public class ProjectTimerCommand : MultistateActionEditorCommand
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

            // Added in the order of ProjectKey.Idle, Running, Offline (0, 1, 2).
            this.AddState("Idle", "Not running");
            this.AddState("Running", "Timer running");
            this.AddState("Offline", "Stint isn't running");

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
            ((StintPlugin)this.Plugin).Stint.Changed += this.OnStintChanged;
            return true;
        }

        protected override Boolean OnUnload()
        {
            ((StintPlugin)this.Plugin).Stint.Changed -= this.OnStintChanged;
            return true;
        }

        /// <summary>Fill the dropdown: "Client · Project", in Stint's order.</summary>
        private void OnListboxItemsRequested(Object? sender, ActionEditorListboxItemsRequestedEventArgs e)
        {
            if (e.ControlName != ProjectControl)
            {
                return;
            }
            foreach (var p in this.Stint.Projects)
            {
                e.AddItem(name: p.Id, displayName: $"{p.ClientName} · {p.Name}", description: null);
            }
        }

        protected override Boolean RunCommand(ActionEditorActionParameters actionParameters)
        {
            if (actionParameters.TryGetString(ProjectControl, out var projectId) && !String.IsNullOrEmpty(projectId))
            {
                // `_ =` starts the send without waiting for it; the key changes state when Stint's new state arrives.
                _ = this.Stint.ToggleTimerAsync(projectId);
            }
            return true;
        }

        // Asked once per state when the key is set up (see the note at the top).
        protected override String GetCommandDisplayName(ActionEditorActionParameters actionParameters, Int32 stateIndex) =>
            this.FindProject(actionParameters)?.Name ?? "Project Timer";

        protected override BitmapImage GetCommandImage(ActionEditorActionParameters actionParameters, Int32 stateIndex, Int32 imageWidth, Int32 imageHeight) =>
            ProjectKey.Draw(this.FindProject(actionParameters), stateIndex, imageWidth, imageHeight);

        // A key's settings are just its project id (confirmed on the Keypad), so
        // building them from an id reaches every key set to that project.
        private static ActionEditorActionParameters Settings(String projectId) =>
            new(new Dictionary<String, String> { [ProjectControl] = projectId });

        private ProjectEntry? FindProject(ActionEditorActionParameters actionParameters) =>
            this.Stint.Projects.FirstOrDefault(p => p.Id == actionParameters.GetString(ProjectControl));

        private void OnStintChanged()
        {
            // New projects, renames, or a different order: refresh the dropdown if it's open.
            var projects = this.Stint.Projects;
            if (!ReferenceEquals(this._knownProjects, projects))
            {
                this._knownProjects = projects;
                this.ActionEditor.ListboxItemsChanged(ProjectControl);
            }
            this.UpdateStates();
        }

        /// <summary>Put every Project Timer key in the state that matches Stint.</summary>
        private void UpdateStates()
        {
            var stint = this.Stint;
            var runningId = stint.State?.Running?.ProjectId;
            bool online = stint.Status == ConnectionStatus.Connected;

            foreach (var project in stint.Projects)
            {
                var parameters = Settings(project.Id);
                var projectId = project.Id;
                int wanted = !online ? ProjectKey.Offline
                    : projectId == runningId ? ProjectKey.Running
                    : ProjectKey.Idle;
                if (!this.TryGetCurrentStateIndex(parameters, out int current) || current != wanted)
                {
                    this.SetCurrentState(parameters, wanted);
                }
            }
        }
    }
}
