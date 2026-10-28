// SPDX-License-Identifier: MIT
// The live image for a key bound to one project, shared by the Project key and the
// keys on the All Projects page.
namespace Loupedeck.StintPlugin
{
    using global::Stint.Keypad;

    internal static class ProjectKey
    {
        /// <summary>
        /// Idle: the client's color bar and the name. Running: filled with the
        /// client's color, with the live elapsed time.
        /// </summary>
        public static BitmapImage Draw(StintConnection stint, string? projectId, int width, int height)
        {
            if (stint.Status != ConnectionStatus.Connected)
            {
                return KeyArt.Unavailable(width, height, stint.Status);
            }
            var project = stint.Projects.FirstOrDefault(p => p.Id == projectId);
            if (project == null)
            {
                // Archived or deleted in Stint since this key was set up.
                return KeyArt.Label(width, height, "Project Unavailable", muted: true);
            }
            var running = stint.State?.Running;
            if (running != null && running.ProjectId == project.Id)
            {
                long elapsed = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - running.StartedAt) / 1000;
                return KeyArt.RunningProject(width, height, project, Format.Elapsed(elapsed));
            }
            return KeyArt.Project(width, height, project);
        }
    }
}
