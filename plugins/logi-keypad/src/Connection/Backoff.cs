// SPDX-License-Identifier: MIT
// How long to wait before reconnecting: 1 s, 2 s, 4 s ... up to 30 s, back to
// 1 s once a connection works. Quick when Stint was only restarting, gentle when
// it's closed for the day.
namespace Stint.Keypad
{
    public class Backoff
    {
        private static readonly TimeSpan First = TimeSpan.FromSeconds(1);
        private static readonly TimeSpan Max = TimeSpan.FromSeconds(30);

        private TimeSpan _next = First;

        public TimeSpan Next()
        {
            var delay = this._next;
            this._next = TimeSpan.FromTicks(Math.Min(this._next.Ticks * 2, Max.Ticks));
            return delay;
        }

        public void Reset() => this._next = First;
    }
}
