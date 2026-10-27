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

        public StintPlugin()
        {
            // Let PluginLog.Info(...) etc. write to the service's log file for this plugin.
            PluginLog.Init(this.Log);
            // Let other classes read images bundled inside the plugin's .dll.
            PluginResources.Init(this.Assembly);

            var folders = ConnectionInfo.DefaultFolders();
            this.Stint = new StintConnection(() => ConnectionInfo.Find(folders), PluginLog.Info);
        }

        // Called after the plugin and all its actions are created.
        public override void Load()
        {
            this.Stint.Start();
            PluginLog.Info("Stint plugin loaded");
        }

        // Called before the service unloads the plugin (quitting, updating, or a dev rebuild).
        public override void Unload()
        {
            // Wait (briefly) for the connection to close, so a rebuild doesn't leave
            // an old connection open in Stint's "Connected" list.
            this.Stint.StopAsync().Wait(TimeSpan.FromSeconds(2));
            this.Stint.Dispose();
        }
    }
}
