// SPDX-License-Identifier: MIT
namespace Stint.Keypad.Tests
{
    // IDisposable: xUnit calls Dispose() after each test, like afterEach.
    public sealed class ConnectionInfoTests : IDisposable
    {
        private readonly string _root = Directory.CreateTempSubdirectory("stint-keypad-").FullName;

        public void Dispose() => Directory.Delete(this._root, recursive: true);

        private string Folder(string name)
        {
            var path = Path.Combine(this._root, name);
            Directory.CreateDirectory(path);
            return path;
        }

        private static void WriteFile(string folder, string json, DateTime writtenAt)
        {
            var path = Path.Combine(folder, "local-api.json");
            File.WriteAllText(path, json);
            File.SetLastWriteTimeUtc(path, writtenAt);
        }

        [Fact]
        public void ReadsTheFile()
        {
            var stint = this.Folder("Stint");
            WriteFile(stint, """{"v":1,"enabled":true,"port":47823,"token":"abc"}""", DateTime.UtcNow);
            Assert.Equal(new ConnectionInfo(true, 47823, "abc"), ConnectionInfo.Find([stint]));
        }

        [Fact]
        public void UsesTheMostRecentlyWrittenFile()
        {
            var installed = this.Folder("Stint");
            var dev = this.Folder("Stint Dev");
            WriteFile(installed, """{"enabled":true,"port":47823,"token":"old"}""", DateTime.UtcNow.AddHours(-1));
            WriteFile(dev, """{"enabled":true,"port":47824,"token":"new"}""", DateTime.UtcNow);
            Assert.Equal(47824, ConnectionInfo.Find([installed, dev])?.Port);
        }

        [Fact]
        public void ReportsDisabled()
        {
            var stint = this.Folder("Stint");
            WriteFile(stint, """{"enabled":false,"port":47823,"token":"abc"}""", DateTime.UtcNow);
            Assert.False(ConnectionInfo.Find([stint])?.Enabled);
        }

        [Fact]
        public void ReturnsNullWhenThereIsNoFile()
        {
            Assert.Null(ConnectionInfo.Find([this.Folder("Stint"), Path.Combine(this._root, "missing")]));
        }

        [Theory]
        [InlineData("{ nope")]
        [InlineData("""{"enabled":true,"token":"abc"}""")]
        [InlineData("""{"enabled":true,"port":0,"token":"abc"}""")]
        [InlineData("""{"enabled":true,"port":47823,"token":""}""")]
        public void ReturnsNullForBrokenFiles(string json)
        {
            var stint = this.Folder("Stint");
            WriteFile(stint, json, DateTime.UtcNow);
            Assert.Null(ConnectionInfo.Find([stint]));
        }

        [Fact]
        public void BackoffDoublesUpTo30SecondsAndResets()
        {
            var backoff = new Backoff();
            var delays = Enumerable.Range(0, 7).Select(_ => backoff.Next().TotalSeconds);
            Assert.Equal([1, 2, 4, 8, 16, 30, 30], delays);
            backoff.Reset();
            Assert.Equal(1, backoff.Next().TotalSeconds);
        }
    }
}
