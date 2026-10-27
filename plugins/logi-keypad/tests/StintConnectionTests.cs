// SPDX-License-Identifier: MIT
// Runs StintConnection against a small fake Stint server (HttpListener with WebSockets).
namespace Stint.Keypad.Tests
{
    using System.Collections.Concurrent;
    using System.Net;
    using System.Net.Sockets;
    using System.Net.WebSockets;
    using System.Text;

    public sealed class StintConnectionTests : IAsyncLifetime
    {
        private const string Token = "secret";
        private const string StateJson = """
            {"type":"state","running":null,"favorites":[],
             "totals":{"todaySeconds":60,"weekSeconds":120,"unbilledSeconds":30,"unbilledAmounts":[]}}
            """;
        private const string ProjectsJson = """
            {"type":"projects","list":[{"id":"p1","clientId":"c1","name":"Site","clientName":"Acme","color":"#336699"}]}
            """;

        private readonly int _port = FreePort();
        private readonly HttpListener _listener = new();
        private readonly BlockingCollection<WebSocket> _accepted = new();
        private readonly BlockingCollection<string> _received = new();
        private StintConnection _connection = null!;
        private ConnectionInfo? _info;

        // Like beforeEach/afterEach, but allowed to be async.
        public Task InitializeAsync()
        {
            this._listener.Prefixes.Add($"http://localhost:{this._port}/");
            this._listener.Start();
            _ = Task.Run(this.AcceptLoopAsync); // `_ =` runs it without awaiting.
            this._info = new ConnectionInfo(true, this._port, Token);
            this._connection = new StintConnection(() => this._info, host: "localhost");
            return Task.CompletedTask;
        }

        public async Task DisposeAsync()
        {
            await this._connection.StopAsync();
            this._connection.Dispose();
            this._listener.Close();
        }

        [Fact]
        public async Task SaysHelloAndKeepsStateAndProjects()
        {
            this._connection.Start();
            var socket = this.NextConnection();
            Assert.Equal("""{"type":"hello","token":"secret","client":"logi-keypad","v":1}""", this.NextReceived());

            await Send(socket, StateJson);
            await Send(socket, ProjectsJson);
            await WaitFor(() => this._connection.Projects.Count == 1);

            Assert.Equal(ConnectionStatus.Connected, this._connection.Status);
            Assert.Equal(60, this._connection.State?.Totals.TodaySeconds);
            Assert.Equal("Site", this._connection.Projects[0].Name);
        }

        [Fact]
        public async Task SendsCommands()
        {
            this._connection.Start();
            var socket = this.NextConnection();
            this.NextReceived(); // hello
            await Send(socket, StateJson);
            await WaitFor(() => this._connection.Status == ConnectionStatus.Connected);

            await this._connection.ToggleTimerAsync("p1");
            await this._connection.StopTimerAsync();
            await this._connection.OpenSwitcherAsync();
            Assert.Equal("""{"type":"toggle","projectId":"p1"}""", this.NextReceived());
            Assert.Equal("""{"type":"stop"}""", this.NextReceived());
            Assert.Equal("""{"type":"openSwitcher"}""", this.NextReceived());
        }

        [Fact]
        public async Task GoesOfflineAndReconnectsWhenStintCloses()
        {
            this._connection.Start();
            var first = this.NextConnection();
            this.NextReceived();
            await Send(first, StateJson);
            await Send(first, ProjectsJson);
            await WaitFor(() => this._connection.Projects.Count == 1);

            await first.CloseAsync(WebSocketCloseStatus.EndpointUnavailable, "Stint is closing.", CancellationToken.None);
            await WaitFor(() => this._connection.Status == ConnectionStatus.Offline);
            Assert.Null(this._connection.State);
            // The project list survives, so the picker in Logi Options+ still works offline.
            Assert.Single(this._connection.Projects);

            // Backoff was reset by the successful connection, so the retry comes after ~1 s.
            this.NextConnection();
            Assert.Contains("hello", this.NextReceived());
        }

        [Fact]
        public async Task ReportsAWrongToken()
        {
            this._connection.Start();
            var socket = this.NextConnection();
            this.NextReceived();
            await socket.CloseAsync((WebSocketCloseStatus)4001, "Missing or wrong token.", CancellationToken.None);
            await WaitFor(() => this._connection.Status == ConnectionStatus.Unauthorized);
        }

        [Fact]
        public async Task ReportsWhenTheLocalApiIsTurnedOff()
        {
            this._info = this._info! with { Enabled = false }; // `with` copies a record with changes.
            this._connection.Start();
            await WaitFor(() => this._connection.Status == ConnectionStatus.Disabled);
        }

        [Fact]
        public async Task StaysOfflineWhenStintIsNotRunning()
        {
            this._info = new ConnectionInfo(true, FreePort(), Token); // nothing listens there
            this._connection.Start();
            await Task.Delay(300);
            Assert.Equal(ConnectionStatus.Offline, this._connection.Status);
        }

        // --- fake Stint ---

        private async Task AcceptLoopAsync()
        {
            while (this._listener.IsListening)
            {
                HttpListenerContext context;
                try
                {
                    context = await this._listener.GetContextAsync();
                }
                catch (Exception ex) when (ex is HttpListenerException or ObjectDisposedException)
                {
                    return;
                }
                var ws = (await context.AcceptWebSocketAsync(null)).WebSocket;
                this._accepted.Add(ws);
                _ = Task.Run(() => this.ReceiveLoopAsync(ws));
            }
        }

        private async Task ReceiveLoopAsync(WebSocket ws)
        {
            var buffer = new byte[64 * 1024];
            try
            {
                while (ws.State == WebSocketState.Open)
                {
                    var result = await ws.ReceiveAsync(buffer, CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        return;
                    }
                    this._received.Add(Encoding.UTF8.GetString(buffer, 0, result.Count));
                }
            }
            catch (WebSocketException)
            {
            }
        }

        private WebSocket NextConnection() => Take(this._accepted, "a connection");

        private string NextReceived() => Take(this._received, "a message");

        private static T Take<T>(BlockingCollection<T> items, string what)
        {
            Assert.True(items.TryTake(out var item, TimeSpan.FromSeconds(5)), $"Timed out waiting for {what}");
            return item!;
        }

        private static Task Send(WebSocket ws, string json) =>
            ws.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, CancellationToken.None);

        private static async Task WaitFor(Func<bool> condition)
        {
            var deadline = DateTime.UtcNow.AddSeconds(5);
            while (!condition())
            {
                Assert.True(DateTime.UtcNow < deadline, "Timed out waiting for the condition");
                await Task.Delay(20);
            }
        }

        private static int FreePort()
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }
    }
}
