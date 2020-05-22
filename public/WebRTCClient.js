// let { localStream, join, leave, setMic, setCam } = await WebRTCClient({
//   audio: true,
//   video: {
//     facingMode: "user",
//     frameRate: 15,
//     width: 320,
//     height: 240,
//   },
//   signalingSocketAddress: "wss://" + window.location.host,
//   iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//   onRemoteConnected: (id) => { ... },
//   onRemoteDisconnected: (id) => { ... },
//   onUpdatedStream: ({ id, stream }) => { ... },
// });
//
// All arguments are optional.
// By default, the callback functions just log to the console.
//
async function WebRTCClient(config) {
  // DEFAULTS ########################################################

  // Default configuration for local audio stream.
  let audioConfig = config.audio == undefined ? true : config.audio;

  // Default configuration for local video stream.
  let videoConfig =
    config.video == undefined
      ? {
          facingMode: "user",
          frameRate: 15,
          width: 320,
          height: 240,
        }
      : config.video;

  // Default address for the signaling WebSocket.
  let signalingSocketAddress =
    config.signalingSocketAddress == undefined
      ? "wss://" + window.location.host
      : config.signalingSocketAddress;

  // Default ICE configuration.
  let iceServers =
    config.iceServers == undefined
      ? [{ urls: "stun:stun.l.google.com:19302" }]
      : config.iceServers;

  // Default callback on remote connection.
  let onRemoteConnected =
    config.onRemoteConnected == undefined
      ? (id) => {
          console.log("Remote connected", id);
        }
      : config.onRemoteConnected;

  // Default callback on remote disconnection.
  let onRemoteDisconnected =
    config.onRemoteDisconnected == undefined
      ? (id) => {
          console.log("Remote disconnected", id);
        }
      : config.onRemoteDisconnected;

  // Default callback on a stream update.
  let onUpdatedStream =
    config.onUpdatedStream == undefined
      ? ({ id, stream }) => {
          console.log("Updated stream of", id);
        }
      : config.onUpdatedStream;

  // INIT ############################################################

  // Init audio and video streams, merge them in "localStream".
  // let audioStream = await navigator.mediaDevices.getUserMedia({
  //   audio: audioConfig,
  // });
  // let videoStream = await navigator.mediaDevices.getUserMedia({
  //   video: videoConfig,
  // });
  // let localStream = new MediaStream(
  //   videoStream.getVideoTracks().concat(audioStream.getAudioTracks())
  // );
  let localStream = await navigator.mediaDevices.getUserMedia({
    audio: audioConfig,
    video: videoConfig,
  });

  // Hashmap containing every peer connection.
  let pcs = new Map();

  // Initialize the signaling socket.
  let signalingSocket = await SignalingSocket({
    socketAddress: signalingSocketAddress,

    // Callback for each remote peer connection.
    onRemotePeerConnected: (chan, polite) => {
      // Inform caller on defined callback for onRemoteConnected.
      onRemoteConnected(chan.remotePeerId);

      // Start peer connection.
      const pc = PeerConnection({
        rtcConfig: { iceServers },
        signalingChannel: chan,
        polite,
        onRemoteTrack: (streams) => {
          // Inform caller when a stream is updated.
          onUpdatedStream({ id: chan.remotePeerId, stream: streams[0] });
        },
      });
      pcs.set(chan.remotePeerId, pc);

      // Send our local stream to the peer connection.
      pc.setLocalStream(localStream);
    },

    // Callback for each remote peer disconnection.
    onRemotePeerDisconnected: (remotePeerId) => {
      const pc = pcs.get(remotePeerId);
      if (pc == undefined) return;
      pc.close();
      pcs.delete(remotePeerId);

      // Inform caller that a remote peer disconnected.
      onRemoteDisconnected(remotePeerId);
    },
  });

  // JOIN and LEAVE ##################################################

  // Cleaning code when leaving the call.
  function leave() {
    // Warn the other peers that we are leaving.
    signalingSocket.leave();

    // Close all WebRTC peer connections.
    for (let pc of pcs.values()) {
      pc.close();
    }
    pcs.clear();
  }

  // MIC and CAMERA ##################################################

  function setMic(micOn) {
    let audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = micOn;
  }

  function setCam(camOn) {
    let videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = camOn;
  }

  // PUBLIC API of WebRTC ############################################

  return {
    localStream,
    join: signalingSocket.join,
    leave,
    setMic,
    setCam,
  };
}

// Class helping with signaling between WebRTC peers.
//
//   let { join, leave } = await SignalingSocket({
//     socketAddress,
//     onRemotePeerConnected: (channel, polite) => { ... },
//     onRemotePeerDisconnected: (remotePeerId) => { ... },
//   });
async function SignalingSocket({
  socketAddress,
  // Callback for each remote peer connection.
  onRemotePeerConnected,
  // Callback for each remote peer disconnection.
  onRemotePeerDisconnected,
}) {
  // Create the WebSocket object.
  const socket = new WebSocket(socketAddress);

  // If the signaling socket is closed by the browser or server,
  // it means that something unexpected occured.
  socket.onclose = (event) => {
    console.error("OOPS, the signaling socket was closed", event);
    // TODO add a disconnected event
  };

  // Hashmap holding one signaling channel per peer.
  const channels = new Map();

  // Listen to incoming messages and redirect either to
  // the ICE candidate or the description callback.
  socket.onmessage = (jsonMsg) => {
    const msg = JSON.parse(jsonMsg.data);
    if (msg == "pong") {
      // The server "pong" answer to our "ping".
      console.log("pong");
    } else if (msg.msgType == "greet") {
      // A peer just connected with us.
      const chan = addChannel(msg.remotePeerId);
      onRemotePeerConnected(chan, msg.polite);
    } else if (msg.msgType == "left") {
      // A peer just disconnected.
      channels.delete(msg.remotePeerId);
      onRemotePeerDisconnected(msg.remotePeerId);
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

  // --------------- Private helper functions of SignalingSocket

  // Add a dedicated channel for a remote peer.
  // Return the created channel to the caller.
  function addChannel(remotePeerId) {
    const chan = {
      remotePeerId: remotePeerId,
      // Send a session description to the remote peer.
      sendDescription: (localDescription) =>
        sendJsonMsg("sessionDescription", remotePeerId, {
          data: localDescription,
        }),
      // Send an ICE candidate to the remote peer.
      sendIceCandidate: (iceCandidate) =>
        sendJsonMsg("iceCandidate", remotePeerId, { data: iceCandidate }),
      // Callbacks to be defined later.
      onRemoteDescription: undefined,
      onRemoteIceCandidate: undefined,
    };
    // Add the dedicated channel to our hashmap containing all channels.
    channels.set(remotePeerId, chan);
    return chan;
  }

  // Helper function to send a JSON message to the signaling socket.
  function sendJsonMsg(msgType, remotePeerId, extra = {}) {
    const msg = Object.assign({ msgType, remotePeerId }, extra);
    socket.send(JSON.stringify(msg));
  }

  // Prevent time out with regular ping-pong exchanges.
  function ping(ms) {
    setTimeout(() => {
      if (socket.readyState != 1) return;
      socket.send(JSON.stringify("ping"));
      ping(ms);
    }, ms);
  }

  // PUBLIC API of SignalingSocket #################################
  //
  // { join, leave } = await SignalingSocket(...);

  return new Promise(function (resolve, reject) {
    socket.onopen = () => {
      ping(10000);
      resolve({
        // Inform the signaling server that we are ready.
        join: () => socket.send(JSON.stringify({ msgType: "join" })),
        // Inform the signaling server that we are leaving.
        leave: () => socket.send(JSON.stringify({ msgType: "leave" })),
      });
    };
    socket.onerror = reject;
  });
}

// Create a peer connection with a dedicated signaling channel.
//
//   let { setLocalStream, close } = PeerConnection({
//     rtcConfig,
//     signalingChannel,
//     polite,
//     onRemoteTrack: (streams) => { ... },
//   });
function PeerConnection({
  rtcConfig,
  signalingChannel,
  polite,
  onRemoteTrack,
}) {
  // Init the RTCPeerConnection.
  let pc = new RTCPeerConnection(rtcConfig);

  // Notify the updated streams when a track is received.
  pc.ontrack = ({ track, streams }) => {
    track.onunmute = () => onRemoteTrack(streams);
  };

  // Below is the "perfect negotiation" logic.
  // https://w3c.github.io/webrtc-pc/#perfect-negotiation-example

  // Send any ice candidates to the other peer
  pc.onicecandidate = ({ candidate }) =>
    signalingChannel.sendIceCandidate(candidate);

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

  // Handling remote session description update.
  signalingChannel.onRemoteDescription = async (description) => {
    if (description == null) return;
    const offerCollision =
      description.type == "offer" &&
      (makingOffer || pc.signalingState != "stable");
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;
    // When you call setRemoteDescription(),
    // the ICE agent checks to make sure the RTCPeerConnection
    // is in either the stable or have-remote-offer signalingState.
    //
    // Note: Earlier implementations of WebRTC
    // would throw an exception if an offer was set
    // outside a stable or have-remote-offer state.
    //
    // if (offerCollision && pc.signalingState == "have-local-offer") {
    if (offerCollision) {
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
    // Perfect negotiation with the updated APIs:
    // await pc.setRemoteDescription(description); // SRD rolls back as needed
    // if (description.type == "offer") {
    //   await pc.setLocalDescription();
    //   signaling.send({ description: pc.localDescription });
    // }
  };

  // Handling remote ICE candidate update.
  signalingChannel.onRemoteIceCandidate = async (candidate) => {
    if (candidate == null) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      if (!ignoreOffer) throw err;
    }
  };

  // PUBLIC API of PeerConnection ##################################
  //
  // { setLocalStream, close } = PeerConnection(...);

  return {
    // Set the local stream to the given one.
    setLocalStream: (localStream) => {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    },
    // Close the connection with the peer.
    close: () => {
      pc.close();
      pc = null;
      signalingChannel = null; // is it needed?
    },
  };
}
