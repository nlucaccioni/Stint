// SPDX-License-Identifier: MIT
// Keeps a WebSocket connection to Stint open for as long as the plugin runs:
// connects, says hello, keeps the latest state and project list, sends commands,
// and reconnects with backoff whenever Stint closes or isn't running.
//
// Keys read State/Projects/Status whenever they draw, and redraw when Changed fires.
//
// C# notes:
// - `async Task` is like an `async` function returning `Promise<void>`;
//   `await` works the same way.
// - A CancellationToken is like an AbortSignal: Stop() cancels it, and every
//   await that was handed the token stops early.
// - Unlike JS, C# code runs on several threads at once. The receive loop runs on
//   one, key presses arrive on others. So shared values are swapped whole (never
//   edited in place), and sends take turns through a SemaphoreSlim (a lock that
//   works with await).
namespace Stint.Keypad
{
    using System.Net.WebSockets;
    using System.Text;

    public enum ConnectionStatus
    {
        /// <summary>Stint isn't running (or hasn't been installed / opened yet).</summary>
        Offline,
        /// <summary>Connected; State and Projects are current.</summary>
        Connected,
        /// <summary>Stint is running but "Allow the MX Keypad Plugin to Connect" is off.</summary>
        Disabled,
        /// <summary>Stint rejected the token (it should fix itself on the next attempt).</summary>
        Unauthorized,
        /// <summary>Stint speaks a different protocol version: one of the two needs updating.</summary>
        Incompatible,
    }

    public sealed class StintConnection : IDisposable
    {
        private const int MaxMessageBytes = 1024 * 1024;
        private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(5);

        private readonly Func<ConnectionInfo?> _findInfo;
        private readonly string _host;
        private readonly Action<string> _log;
        private readonly Backoff _backoff = new();
        private readonly SemaphoreSlim _sendLock = new(1, 1);
        private readonly CancellationTokenSource _stop = new();

        // `volatile`: always read the latest value, even when another thread wrote it.
        private volatile ClientWebSocket? _socket;
        private volatile StintState? _state;
        private volatile IReadOnlyList<ProjectEntry> _projects = Array.Empty<ProjectEntry>();
        private volatile ConnectionStatus _status = ConnectionStatus.Offline;
        private long _stateReceivedAt;
        private Task? _loop;

        /// <param name="findInfo">Reads the port and token (ConnectionInfo.Find in the plugin).</param>
        /// <param name="host">Tests use "localhost"; Stint itself listens on 127.0.0.1.</param>
        public StintConnection(Func<ConnectionInfo?> findInfo, Action<string>? log = null, string host = "127.0.0.1")
        {
            this._findInfo = findInfo;
            this._log = log ?? (_ => { });
            this._host = host;
        }

        /// <summary>Raised (on a background thread) when State, Projects, or Status change.</summary>
        public event Action? Changed;

        public ConnectionStatus Status => this._status;

        /// <summary>The latest state from Stint, or null while not connected.</summary>
        public StintState? State => this._state;

        /// <summary>
        /// Stint's active projects. Kept while offline, so the project picker in
        /// Logi Options+ still lists them when Stint is closed.
        /// </summary>
        public IReadOnlyList<ProjectEntry> Projects => this._projects;

        /// <summary>When State arrived (Unix ms), for counting totals up between updates.</summary>
        public long StateReceivedAt => Interlocked.Read(ref this._stateReceivedAt);

        public void Start() => this._loop ??= Task.Run(() => this.RunAsync(this._stop.Token));

        /// <summary>
        /// Start with a project list saved from an earlier run, so project keys know
        /// their projects before Stint connects. Stint's own list replaces it.
        /// </summary>
        public void SeedProjects(IReadOnlyList<ProjectEntry> projects)
        {
            if (this._projects.Count == 0)
            {
                this._projects = projects;
            }
        }

        public async Task StopAsync()
        {
            this._stop.Cancel();
            if (this._loop != null)
            {
                await this._loop.ConfigureAwait(false);
            }
        }

        public void Dispose()
        {
            this._stop.Cancel();
            this._sendLock.Dispose();
        }

        // Commands. They do nothing while offline: a key press then is simply lost,
        // and the key is already showing "Stint Offline".
        public Task StartTimerAsync(string projectId) => this.SendAsync(Protocol.Start(projectId));

        public Task ToggleTimerAsync(string projectId) => this.SendAsync(Protocol.Toggle(projectId));

        public Task StopTimerAsync() => this.SendAsync(Protocol.Stop());

        public Task OpenSwitcherAsync() => this.SendAsync(Protocol.OpenSwitcher());

        private async Task RunAsync(CancellationToken stop)
        {
            while (!stop.IsCancellationRequested)
            {
                var info = this._findInfo();
                if (info is { Enabled: true })
                {
                    await this.ConnectOnceAsync(info, stop).ConfigureAwait(false);
                }
                else
                {
                    this.SetStatus(info == null ? ConnectionStatus.Offline : ConnectionStatus.Disabled);
                }

                try
                {
                    await Task.Delay(this._backoff.Next(), stop).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
            this.SetStatus(ConnectionStatus.Offline);
        }

        /// <summary>One connection, from connect until Stint (or the network) closes it.</summary>
        private async Task ConnectOnceAsync(ConnectionInfo info, CancellationToken stop)
        {
            using var socket = new ClientWebSocket();
            try
            {
                using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop))
                {
                    timeout.CancelAfter(ConnectTimeout);
                    await socket.ConnectAsync(new Uri($"ws://{this._host}:{info.Port}/"), timeout.Token).ConfigureAwait(false);
                }
                this._socket = socket;
                await this.SendAsync(Protocol.Hello(info.Token)).ConfigureAwait(false);

                while (true)
                {
                    var text = await ReceiveTextAsync(socket, stop).ConfigureAwait(false);
                    if (text == null)
                    {
                        break; // Stint closed the connection.
                    }
                    this.Handle(Protocol.Parse(text));
                }
                this.Disconnected(StatusForClose(socket.CloseStatus));
                this._log($"Stint closed the connection ({(int?)socket.CloseStatus} {socket.CloseStatusDescription})");
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested)
            {
                // The plugin is unloading: say goodbye politely, but don't wait long.
                await CloseQuietlyAsync(socket).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or IOException)
            {
                // Usually "connection refused": Stint isn't running. Not worth a log line each retry.
                this.Disconnected(ConnectionStatus.Offline);
            }
            finally
            {
                this._socket = null;
                this._state = null; // No live state while disconnected; keys show offline.
            }
        }

        /// <summary>
        /// Drop the connection's state, then report the new status. In that order, so
        /// anything reacting to the status (a key redrawing) never sees stale state.
        /// </summary>
        private void Disconnected(ConnectionStatus status)
        {
            this._socket = null;
            this._state = null;
            this.SetStatus(status);
        }

        private void Handle(ServerMessage? message)
        {
            if (message?.State != null)
            {
                Interlocked.Exchange(ref this._stateReceivedAt, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                this._state = message.State;
                // The first state after hello means the handshake worked.
                if (this.Status != ConnectionStatus.Connected)
                {
                    this._backoff.Reset();
                    this._log("Connected to Stint");
                    this.SetStatus(ConnectionStatus.Connected, raise: false);
                }
                this.Changed?.Invoke();
            }
            else if (message?.Projects != null)
            {
                this._projects = message.Projects;
                this.Changed?.Invoke();
            }
            else if (message?.Error != null)
            {
                this._log($"Stint error {message.Error.Code}: {message.Error.Message}");
            }
        }

        private async Task SendAsync(string json)
        {
            var socket = this._socket;
            if (socket?.State != WebSocketState.Open)
            {
                return;
            }
            // Only one send at a time on a WebSocket: wait for our turn.
            await this._sendLock.WaitAsync().ConfigureAwait(false);
            try
            {
                await socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, CancellationToken.None)
                    .ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is WebSocketException or ObjectDisposedException)
            {
                // The connection just dropped; the receive loop notices and reconnects.
            }
            finally
            {
                this._sendLock.Release();
            }
        }

        /// <summary>Read one whole text message (it may arrive in several pieces). Null when closed.</summary>
        private static async Task<string?> ReceiveTextAsync(ClientWebSocket socket, CancellationToken stop)
        {
            var buffer = new byte[16 * 1024];
            using var message = new MemoryStream();
            while (true)
            {
                var result = await socket.ReceiveAsync(buffer, stop).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await CloseQuietlyAsync(socket).ConfigureAwait(false);
                    return null;
                }
                message.Write(buffer, 0, result.Count);
                if (message.Length > MaxMessageBytes)
                {
                    throw new WebSocketException("Message from Stint is too large.");
                }
                if (result.EndOfMessage)
                {
                    return Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                }
            }
        }

        private static async Task CloseQuietlyAsync(ClientWebSocket socket)
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, timeout.Token).ConfigureAwait(false);
                }
            }
            catch (Exception ex) when (ex is WebSocketException or OperationCanceledException or ObjectDisposedException)
            {
            }
        }

        private static ConnectionStatus StatusForClose(WebSocketCloseStatus? code) => (int?)code switch
        {
            Protocol.CloseUnauthorized => ConnectionStatus.Unauthorized,
            Protocol.CloseUnsupportedVersion => ConnectionStatus.Incompatible,
            _ => ConnectionStatus.Offline,
        };

        private void SetStatus(ConnectionStatus status, bool raise = true)
        {
            if (this._status == status)
            {
                return;
            }
            this._status = status;
            if (status != ConnectionStatus.Connected)
            {
                this._log($"Status: {status}");
            }
            if (raise)
            {
                this.Changed?.Invoke();
            }
        }
    }
}
