import { writeFileSync } from "node:fs";

const [outputPath, clipHeight] = process.argv.slice(2);

if (!outputPath) {
   console.log("usage: node tools/shot.mjs <output.png> [clip-height-in-css-px]");
   process.exit(1);
}

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

const timer = setTimeout(() => {
   console.error("Timed out waiting for the screenshot.");
   process.exit(1);
}, 15000);

socket.onopen = () => {
   const params = { format: "png" };

   if (clipHeight) {
      params.clip = { x: 0, y: 0, width: 4000, height: Number(clipHeight), scale: 1 };
   }

   socket.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params }));
};

socket.onmessage = (event) => {
   const message = JSON.parse(event.data);

   if (message.id !== 1) {
      return;
   }

   clearTimeout(timer);

   if (message.error) {
      console.error(JSON.stringify(message.error));
      process.exit(1);
   }

   writeFileSync(outputPath, Buffer.from(message.result.data, "base64"));
   process.exit(0);
};
