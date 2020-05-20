// Class helping with signaling between WebRTC peers.
//
// First create a single instance with:
//   const signalingSocket = new SignalingSocket(socketAddress);
//
// Then add a callback for when remote peers are connected:
//   signalingSocket.onRemotePeerConnected = (chan, polite) => {
//     peerConnection = new PeerConnection(iceConfig, chan, polite);
//     ...
//   };
//
// And a callback for when a remote is disconnected:
//   signalingSocket.onRemotePeerDisconnected = (remotePeerId) => { ... };
//
// Finally inform the server that you are ready to connect:
//   signalingSocket.join();
function SignalingSocket(socketAddress) {
  // Create the WebSocket object.
  const socket = new WebSocket(socketAddress);

  // Prevent time out with regular ping-pong exchanges.
  (function ping(ms) {
    setTimeout(() => {
      socket.send(JSON.stringify("ping"));
      ping(ms);
    }, ms);
  })(10000);

  // Callback for each remote peer also connected.
  this.onRemotePeerConnected = undefined;

  // Callback for each remote peer is disconnected.
  this.onRemotePeerDisconnected = undefined;

  // Hashmap holding all signaling channels between peers.
  const channels = new Map();

  // Say Hi to the server to let it know we are ready.
  this.join = () => {
    if (socket.readyState == 1) {
      // 1 = OPEN
      sendJoin();
    } else if (socket.readyState == 0) {
      // 0 = CONNECTING
      socket.onopen = sendJoin;
    } else {
      console.error("OOPS socket in state:", socket.readyState);
    }
  };

  socket.onclose = (event) => {
    console.error("OOPS socket closed", event);
  };

  // Inform others that we are leaving.
  this.leave = () => {
    sendLeave();
  };

  // Listen to messages and redirect either to
  // the ICE candidate or the description callback.
  socket.onmessage = (jsonMsg) => {
    let msg = JSON.parse(jsonMsg.data);
    if (msg == "pong") {
      console.log("pong");
    } else if (msg.msgType == "greet") {
      let chan = addChannel(msg.remotePeerId);
      this.onRemotePeerConnected(chan, msg.polite);
    } else if (msg.msgType == "left") {
      channels.delete(msg.remotePeerId);
      this.onRemotePeerDisconnected(msg.remotePeerId);
    } else {
      const chan = channels.get(msg.remotePeerId);
      if (chan == undefined) return;
      if (msg.msgType == "sessionDescription") {
        chan.onRemoteDescription(msg.data);
      } else if (msg.msgType == "iceCandidate") {
        chan.onRemoteIceCandidate(msg.data);
      }
    }
  };

  // --------------- Private functions

  // Add a dedicated channel for a remote peer.
  // Return the created channel to the caller.
  function addChannel(remotePeerId) {
    const chan = {
      remotePeerId: remotePeerId,
      sendDescription: (localDescription) =>
        sendDescription(remotePeerId, localDescription),
      sendIceCandidate: (iceCandidate) =>
        sendIceCandidate(remotePeerId, iceCandidate),
      onRemoteDescription: undefined,
      onRemoteIceCandidate: undefined,
    };
    channels.set(remotePeerId, chan);
    return chan;
  }

  // Inform the signaling server that we are ready.
  function sendJoin() {
    socket.send(JSON.stringify({ msgType: "join" }));
  }

  // Inform the signaling server that we are leaving.
  function sendLeave() {
    socket.send(JSON.stringify({ msgType: "leave" }));
  }

  // Send a session description to the remote peer.
  function sendDescription(remotePeerId, localDescription) {
    socket.send(
      JSON.stringify({
        remotePeerId: remotePeerId,
        msgType: "sessionDescription",
        data: localDescription,
      })
    );
  }

  // Send an ICE candidate to the remote peer.
  function sendIceCandidate(remotePeerId, iceCandidate) {
    socket.send(
      JSON.stringify({
        remotePeerId: remotePeerId,
        msgType: "iceCandidate",
        data: iceCandidate,
      })
    );
  }
}

// Create a peer connection with a dedicated signaling channel.
//   const peerConnection = new PeerConnection(iceConfig, chan, polite);
//
// Then add a callback function for when remote track are added.
//   peerConnection.onRemoteTrack = (streams) => { ... };
//
// Finally set the local stream.
//   peerConnection.setLocalStream(localStream);
function PeerConnection(iceConfig, signalingChannel, polite) {
  // Init the RTCPeerConnection.
  let pc = new RTCPeerConnection(iceConfig);

  // Callback for when tracks are being received.
  this.onRemoteTrack = undefined;

  // Notify the updated streams when a track is received.
  pc.ontrack = ({ track, streams }) => {
    track.onunmute = () => this.onRemoteTrack(streams);
  };

  // Set the local stream to the given one.
  this.setLocalStream = (localStream) => {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  };

  // Close the connection with the peer.
  this.close = () => {
    pc.close();
    pc = null;
    signalingChannel = null; // is it needed?
  };

  // Handling the negotiationneeded event.
  let makingOffer = false;
  let ignoreOffer = false;
  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      if (pc.signalingState != "stable") return;
      await pc.setLocalDescription(offer);
      signalingChannel.sendDescription(pc.localDescription);
    } catch (err) {
      console.error("ONN", err);
    } finally {
      makingOffer = false;
    }
  };

  // Handling an incoming ICE candidate.
  pc.onicecandidate = ({ candidate }) =>
    signalingChannel.sendIceCandidate(candidate);

  // Handling remote session description update.
  signalingChannel.onRemoteDescription = async (description) => {
    if (description == null) return;
    const offerCollision =
      description.type == "offer" &&
      (makingOffer || pc.signalingState != "stable");
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;
    if (offerCollision && pc.signalingState != "stable") {
      await Promise.all([
        pc.setLocalDescription({ type: "rollback" }),
        pc.setRemoteDescription(description),
      ]);
    } else {
      await pc.setRemoteDescription(description);
    }
    if (description.type == "offer") {
      await pc.setLocalDescription(await pc.createAnswer());
      signalingChannel.sendDescription(pc.localDescription);
    }
  };

  // Handling remote ICE candidate update.
  signalingChannel.onRemoteIceCandidate = async (candidate) => {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      if (!ignoreOffer) throw err;
    }
  };
}
