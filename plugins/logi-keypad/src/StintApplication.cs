// SPDX-License-Identifier: MIT
// The SDK expects every plugin to have a ClientApplication: the desktop app it
// controls, which the service uses to switch key profiles when that app comes to
// the front. Stint's keys work whichever app is in front (HasNoApplication in
// StintPlugin.cs), so this stays empty.
namespace Loupedeck.StintPlugin
{
    using System;

    public class StintApplication : ClientApplication
    {
        // Windows process name / macOS bundle id to watch for. Empty: none.
        protected override String GetProcessName() => "";

        protected override String GetBundleName() => "";

        public override ClientApplicationStatus GetApplicationStatus() => ClientApplicationStatus.Unknown;
    }
}
