import { readFileSync } from "node:fs";

let targets;

try {
   targets = await (await fetch("http://localhost:9222/json")).json();
} catch (error) {
   console.error("Nothing on localhost:9222. Start Spotify with sh tools/debug-spotify.sh first.");
   process.exit(1);
}

const page = targets.find((target) => target.url.startsWith("https://xpui.app.spotify.com"));

if (!page) {
   console.error("Port 9222 is open but Spotify's page isn't there yet.");
   process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const expression = process.argv[2] === "-f" ? readFileSync(process.argv[3], "utf8") : process.argv[2];

const timer = setTimeout(() => {
   console.log("timeout");
   process.exit(1);
}, 15000);

socket.onopen = () => {
   socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
   }));
};

socket.onmessage = (event) => {
   const message = JSON.parse(event.data);

   if (message.id !== 1) {
      return;
   }

   clearTimeout(timer);

   if (message.error) {
      console.log(JSON.stringify(message.error));
      process.exit(1);
   }

   const result = message.result;
   const value = result.exceptionDetails ? result.exceptionDetails : result.result.value;
   console.log(typeof value === "string" ? value : JSON.stringify(value, null, 1));
   socket.close();
   process.exit(0);
};
