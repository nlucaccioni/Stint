// SPDX-License-Identifier: MIT
namespace Stint.Keypad.Tests
{
    using System.Text.Json;

    public class ProtocolTests
    {
        [Fact]
        public void ParsesState()
        {
            var message = Protocol.Parse("""
                {
                  "type": "state",
                  "running": { "sessionId": "s1", "projectId": "p1", "clientId": "c1", "startedAt": 1761487200000 },
                  "favorites": ["p1", null, null, null, null, null, null, null, null],
                  "totals": {
                    "todaySeconds": 5400, "weekSeconds": 61200, "unbilledSeconds": 183600,
                    "unbilledAmounts": [{ "currency": "USD", "cents": 510000 }]
                  },
                  "addedInAFutureVersion": true
                }
                """);

            var state = message?.State;
            Assert.NotNull(state);
            Assert.Equal(new RunningTimer("s1", "p1", "c1", 1761487200000), state.Running);
            Assert.Equal("p1", state.Favorites[0]);
            Assert.Null(state.Favorites[1]);
            Assert.Equal(5400, state.Totals.TodaySeconds);
            Assert.Equal(183600, state.Totals.UnbilledSeconds);
            Assert.Equal([new Money("USD", 510000)], state.Totals.UnbilledAmounts);
        }

        [Fact]
        public void ParsesStateWithNothingRunning()
        {
            var message = Protocol.Parse("""
                {"type":"state","running":null,"favorites":[],
                 "totals":{"todaySeconds":0,"weekSeconds":0,"unbilledSeconds":0,"unbilledAmounts":[]}}
                """);
            Assert.NotNull(message?.State);
            Assert.Null(message.State.Running);
        }

        [Fact]
        public void ParsesProjects()
        {
            var message = Protocol.Parse("""
                {"type":"projects","list":[
                  {"id":"p1","clientId":"c1","name":"Website","clientName":"Acme","color":"#336699"}]}
                """);
            Assert.Equal([new ProjectEntry("p1", "c1", "Website", "Acme", "#336699")], message?.Projects);
        }

        [Fact]
        public void ParsesErrors()
        {
            var message = Protocol.Parse("""{"type":"error","code":"not-found","message":"Project not found.","id":"7"}""");
            Assert.Equal(new StintError("not-found", "Project not found.", "7"), message?.Error);
        }

        [Theory]
        [InlineData("not json")]
        [InlineData("[]")]
        [InlineData("""{"no":"type"}""")]
        [InlineData("""{"type":"somethingNew"}""")]
        [InlineData("""{"type":"projects"}""")]
        public void IgnoresUnknownOrMalformedMessages(string text)
        {
            Assert.Null(Protocol.Parse(text));
        }

        [Fact]
        public void WritesCommands()
        {
            Assert.Equal(
                new { type = "hello", token = "abc", client = "logi-keypad", v = 1 },
                Read(Protocol.Hello("abc"), new { type = "", token = "", client = "", v = 0 }));
            Assert.Equal("""{"type":"toggle","projectId":"p1"}""", Protocol.Toggle("p1"));
            Assert.Equal("""{"type":"start","projectId":"p1"}""", Protocol.Start("p1"));
            Assert.Equal("""{"type":"stop"}""", Protocol.Stop());
            Assert.Equal("""{"type":"openSwitcher"}""", Protocol.OpenSwitcher());
        }

        // Deserialize into the shape of `example` (anonymous types can't be named).
        private static T Read<T>(string json, T example) =>
            JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }
}
