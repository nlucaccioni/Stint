// SPDX-License-Identifier: MIT
// Logi Plugin Service creates one instance of this class when it loads the plugin.
// It's the plugin's "main": it opens the connection to Stint in Load() and closes
// it in Unload(). Each key action (Actions/) reaches it via this.Plugin.
//
// C# notes for this file:
// - `namespace` groups classes, a bit like a module. `Loupedeck` is the SDK's
//   namespace (Logitech bought Loupedeck); nesting ours inside it lets us use the
//   SDK's types without imports.
// - `public class StintPlugin : Plugin` means StintPlugin extends the SDK's Plugin.
// - `override` replaces a method or property the base class marked as replaceable.
// - `=> true` is shorthand for a property that always returns true.
namespace Loupedeck.StintPlugin
{
    using System;

    using global::Stint.Keypad;

    public class StintPlugin : Plugin
    {
        // Stint isn't an app the plugin automates by sending keystrokes; it talks
        // to it over the Local API. These two tell the service exactly that, so it
        // doesn't wait for some app to be in front before enabling our keys.
        public override Boolean UsesApplicationApiOnly => true;
        public override Boolean HasNoApplication => true;

        /// <summary>The live connection to Stint, shared by every key.</summary>
        public StintConnection Stint { get; }

        /// <summary>The All Projects folder, set when it loads, so a Project key can close its page.</summary>
        public ProjectsFolder? ProjectsFolder { get; set; }

        /// <summary>
        /// The project list saved from the last run, available as soon as the plugin
        /// is created. The service creates the plugin before its actions, and an
        /// action that lists projects in Options+ has to add them in its constructor,
        /// before it can reach the plugin (see ProjectKeyCommand).
        /// </summary>
        public static IReadOnlyList<ProjectEntry> SavedProjects { get; private set; } = Array.Empty<ProjectEntry>();

        /// <summary>
        /// Fires once a second (on a background thread). Keys showing a running
        /// time redraw on it; Stint itself only sends updates when something changes.
        /// </summary>
        public event Action? Tick;

        // A System.Threading.Timer calls its callback on a background thread every period.
        private Timer? _ticker;

        public StintPlugin()
        {
            // Let PluginLog.Info(...) etc. write to the service's log file for this plugin.
            PluginLog.Init(this.Log);
            // Let other classes read images bundled inside the plugin's .dll.
            PluginResources.Init(this.Assembly);

            var folders = ConnectionInfo.DefaultFolders();
            this.Stint = new StintConnection(() => ConnectionInfo.Find(folders), PluginLog.Info);

            // Logi Options+ checks each project key's saved project when the plugin
            // loads, before Stint has connected. Without the last known project list
            // those keys would lose their project, so keep a copy between runs in a
            // small file. (The SDK's plugin settings can't be read this early.)
            this._projectsFile = ProjectsFile();
            try
            {
                if (File.Exists(this._projectsFile))
                {
                    SavedProjects = Protocol.ParseProjects(File.ReadAllText(this._projectsFile));
                    this.Stint.SeedProjects(SavedProjects);
                }
            }
            catch (IOException ex)
            {
                PluginLog.Warning(ex, "Couldn't read the saved project list");
            }
            this.Stint.Changed += this.SaveProjects;
        }

        private readonly String _projectsFile;
        private IReadOnlyList<ProjectEntry>? _savedProjects;

        /// <summary>The plugin's own data folder from the SDK, or one in the user's local app data.</summary>
        private String ProjectsFile()
        {
            String dir;
            try
            {
                dir = this.GetPluginDataDirectory();
            }
            catch (Exception)
            {
                dir = "";
            }
            if (String.IsNullOrEmpty(dir))
            {
                dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StintKeypadPlugin");
            }
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "projects.json");
        }

        private void SaveProjects()
        {
            var projects = this.Stint.Projects;
            if (ReferenceEquals(projects, this._savedProjects) || projects.Count == 0)
            {
                return;
            }
            this._savedProjects = projects;
            try
            {
                File.WriteAllText(this._projectsFile, Protocol.SerializeProjects(projects));
            }
            catch (IOException ex)
            {
                PluginLog.Warning(ex, "Couldn't save the project list");
            }
        }

        // Called after the plugin and all its actions are created.
        public override void Load()
        {
            this.Stint.Start();
            this._ticker = new Timer(_ => this.Tick?.Invoke(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
            PluginLog.Info("Stint plugin loaded");
        }

        // Called before the service unloads the plugin (quitting, updating, or a dev rebuild).
        public override void Unload()
        {
            this._ticker?.Dispose();
            // Wait (briefly) for the connection to close, so a rebuild doesn't leave
            // an old connection open in Stint's "Connected" list.
            this.Stint.StopAsync().Wait(TimeSpan.FromSeconds(2));
            this.Stint.Dispose();
        }
    }
}
