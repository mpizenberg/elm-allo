const http = require("http");
const fs = require("fs");
const express = require("express");
const WebSocket = require("ws");
const { ExpressPeerServer } = require("peer");

const PORT = process.env.PORT || 8443;
// const credentials = {
//   key: fs.readFileSync("server.pem"),
//   cert: fs.readFileSync("server.pem"),
// };

const app = express();
app.use(express.static("public"));

// HTTP, WebSocket and PeerJS servers
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });
const peerServer = ExpressPeerServer(httpServer, {
  debug: true,
  path: "/allo",
});
app.use("/peerjs", peerServer);

// App logic
const peersSocks = new Map();
const peersIds = new Map();
let idCount = 0;

wss.on("connection", (ws, req) => {
  console.log("Connection of " + req.connection.remoteAddress);
  ws.on("message", (jsonMsg) => {
    let msg = JSON.parse(jsonMsg);
    if (msg == "ping") {
      console.log("ping from", req.connection.remoteAddress);
      ws.send(JSON.stringify("pong"));
    } else if (msg.msgType == "join") {
      console.log("join", idCount);
      // Greet each pair of peers on both sides.
      for (let [id, sock] of peersSocks) {
        sendJsonMsg(ws, "greet", id, { me: idCount, polite: true });
        sendJsonMsg(sock, "greet", idCount, { me: id, polite: false });
      }
      peersSocks.set(idCount, ws);
      peersIds.set(ws, idCount);
      idCount += 1;
    } else if (msg.msgType == "leave") {
      leave(ws);
    } else if (msg.msgType == "sessionDescription") {
      relay(ws, msg);
    } else if (msg.msgType == "iceCandidate") {
      relay(ws, msg);
    }
  });
  ws.on("close", () => {
    console.log("WebSocket closing");
    leave(ws);
  });
});

function leave(ws) {
  originId = peersIds.get(ws);
  console.log("leave", originId);
  if (originId == undefined) return;
  peersIds.delete(ws);
  peersSocks.delete(originId);
  for (let [id, sock] of peersSocks) {
    sendJsonMsg(sock, "left", originId);
  }
}

function relay(ws, msg) {
  // Relay message to target peer.
  const target = peersSocks.get(msg.remotePeerId);
  if (target == undefined) return;
  const originId = peersIds.get(ws);
  if (originId == undefined) return;
  console.log("relay", msg.msgType, "from", originId, "to", msg.remotePeerId);
  sendJsonMsg(target, msg.msgType, originId, { data: msg.data });
}

function sendJsonMsg(ws, msgType, remotePeerId, extra = {}) {
  const msg = Object.assign({ msgType, remotePeerId }, extra);
  ws.send(JSON.stringify(msg));
}

console.log("Listening at localhost:" + PORT);
httpServer.listen(PORT);
