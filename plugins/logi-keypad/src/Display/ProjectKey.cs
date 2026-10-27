// SPDX-License-Identifier: MIT
// Images for a Project Timer key. Logi Options+ asks for one image per state when
// the key is set up and reuses them, so each state's image is fixed: the live
// elapsed time can't be shown here (the Stop key shows it instead).
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    internal static class ProjectKey
    {
        // The key's states, in the order ProjectTimerCommand adds them.
        public const int Idle = 0;
        public const int Running = 1;
        public const int Offline = 2;

        public static BitmapImage Draw(ProjectEntry? project, int state, int width, int height)
        {
            if (state == Offline)
            {
                return KeyArt.Unavailable(width, height, ConnectionStatus.Offline);
            }
            if (project == null)
            {
                // Archived or deleted in Stint, or not known yet (Stint hasn't connected since the plugin started).
                return KeyArt.Label(width, height, "Project Unavailable", muted: true);
            }
            return state == Running
                ? KeyArt.RunningProject(width, height, project, "Running")
                : KeyArt.Project(width, height, project);
        }
    }
}
