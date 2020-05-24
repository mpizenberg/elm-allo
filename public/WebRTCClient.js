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
//   onError: (string) => { ... },
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

  // Default callback on error.
  let onError =
    config.onError == undefined ? (str) => console.error(str) : config.onError;

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
  let signalingSocket;
  try {
    signalingSocket = await SignalingSocket({
      socketAddress: signalingSocketAddress,

      // Callback for each remote peer connection.
      onRemotePeerConnected: (chan, polite) => {
        try {
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
            onError,
          });
          pcs.set(chan.remotePeerId, pc);

          // Send our local stream to the peer connection.
          pc.startNegotiation(localStream);
        } catch (err) {
          console.error(err);
          onError("124\n" + err.toString());
        }
      },

      // Callback for each remote peer disconnection.
      onRemotePeerDisconnected: (remotePeerId) => {
        try {
          const pc = pcs.get(remotePeerId);
          if (pc == undefined) return;
          pc.close();
          pcs.delete(remotePeerId);

          // Inform caller that a remote peer disconnected.
          onRemoteDisconnected(remotePeerId);
        } catch (err) {
          console.error(err);
          onError("140\n" + err.toString());
        }
      },
      onError,
    });
  } catch (err) {
    console.error(err);
    onError("146\n" + err.toString());
  }

  // JOIN and LEAVE ##################################################

  // Code executed when joining the call.
  async function join() {
    try {
      const perfectNegotiationOk = await compatiblePerfectNegotiation();
      console.log(
        "Browser compatible with perfect negotiation:",
        perfectNegotiationOk
      );
      signalingSocket.join();
    } catch (err) {
      console.error(err);
      onError("162\n" + err.toString());
    }
  }

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
    join,
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
//     onError: (string) => { ... },
//   });
async function SignalingSocket({
  socketAddress,
  // Callback for each remote peer connection.
  onRemotePeerConnected,
  // Callback for each remote peer disconnection.
  onRemotePeerDisconnected,
  onError,
}) {
  // Create the WebSocket object.
  const socket = new WebSocket(socketAddress);

  // If the signaling socket is closed by the browser or server,
  // it means that something unexpected occured.
  socket.onclose = (event) => {
    throw "The signaling socket was closed";
    // TODO add a disconnected event
  };

  // Hashmap holding one signaling channel per peer.
  const channels = new Map();

  // Listen to incoming messages and redirect either to
  // the ICE candidate or the description callback.
  socket.onmessage = (jsonMsg) => {
    try {
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
    } catch (err) {
      console.error(err);
      onError("257, msg.msgType: " + msg.msgType + "\n" + err.toString());
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
    try {
      const msg = Object.assign({ msgType, remotePeerId }, extra);
      socket.send(JSON.stringify(msg));
    } catch (err) {
      console.error(err);
      onError("292\n" + err.toString());
    }
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
    socket.onerror = (err) => {
      console.error(err);
      onError("321\n" + err.toString());
      reject(err);
    };
  });
}

// Create a peer connection with a dedicated signaling channel.
//
//   let { startNegotiation, close } = PeerConnection({
//     rtcConfig,
//     signalingChannel,
//     polite,
//     onRemoteTrack: (streams) => { ... },
//     onError: (string) => { ... },
//   });
function PeerConnection({
  rtcConfig,
  signalingChannel,
  polite,
  onRemoteTrack,
  onError,
}) {
  // Init the RTCPeerConnection.
  let pc = new RTCPeerConnection(rtcConfig);

  // Notify when a track is received.
  pc.ontrack = ({ track, streams }) => {
    try {
      track.onunmute = () => onRemoteTrack(streams);
    } catch (err) {
      console.error(err);
      onError("352\n" + err.toString());
    }
  };

  // --------------- Private helper functions of PeerConnection

  // SDP and ICE candidate negotiation
  function startNegotiation(localStream) {
    // if (bothPerfectNegotiation) {
    if (false) {
      perfectNegotiation(pc, signalingChannel);
      setLocalStream(pc, localStream);
    } else {
      simpleNegotiation(pc, signalingChannel, localStream);
      // The impolite peer is the caller.
      if (!polite) setLocalStream(pc, localStream);
    }
  }

  // Add tracks of local stream in the peer connection.
  // This will trigger a negotiationneeded event and start negotiations.
  function setLocalStream(pc, localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  // Simple peer-to-peer negotiation.
  // https://w3c.github.io/webrtc-pc/#simple-peer-to-peer-example
  function simpleNegotiation(pc, signalingChannel, localStream) {
    // let the "negotiationneeded" event trigger offer generation
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        signalingChannel.sendDescription(pc.localDescription);
      } catch (err) {
        console.error(err);
        onError("389\n" + err.toString());
      }
    };

    // Handling remote session description update.
    signalingChannel.onRemoteDescription = async (description) => {
      if (description == null) return;
      try {
        if (description.type == "offer") {
          await pc.setRemoteDescription(description);
          setLocalStream(pc, localStream);
          await pc.setLocalDescription(await pc.createAnswer());
          signalingChannel.sendDescription(pc.localDescription);
        } else if (description.type == "answer") {
          await pc.setRemoteDescription(description);
        } else {
          console.log("Unsupported SDP type. Your code may differ here.");
        }
      } catch (err) {
        console.error(err);
        onError("409, type: " + description.type + "\n" + err.toString());
      }
    };

    // Send any ICE candidates to the other peer
    pc.onicecandidate = ({ candidate }) => {
      try {
        signalingChannel.sendIceCandidate(candidate);
      } catch (err) {
        console.error(err);
        onError("419\n" + err.toString());
      }
    };

    // Handling remote ICE candidate update.
    signalingChannel.onRemoteIceCandidate = async (candidate) => {
      if (candidate == null) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error(err);
        onError("430\n" + err.toString());
      }
    };
  }

  // Below is the "perfect negotiation" logic.
  // https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
  //
  // Unfortunately this can still cause race conditions
  // so we are not going to use it anyway.
  // https://stackoverflow.com/questions/61956693/webrtc-perfect-negotiation-issues?noredirect=1#comment109599219_61956693
  function perfectNegotiation(pc, signalingChannel) {
    // Handling the negotiationneeded event.
    let makingOffer = false;
    let ignoreOffer = false;
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        signalingChannel.sendDescription(pc.localDescription);
      } catch (err) {
        throw err;
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
      await pc.setRemoteDescription(description);
      if (description.type == "offer") {
        await pc.setLocalDescription();
        signalingChannel.sendDescription(pc.localDescription);
      }
    };

    // ICE candidate negotiation.

    // Send any ICE candidates to the other peer
    pc.onicecandidate = ({ candidate }) =>
      signalingChannel.sendIceCandidate(candidate);

    // Handling remote ICE candidate update.
    signalingChannel.onRemoteIceCandidate = async (candidate) => {
      if (candidate == null) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        if (!ignoreOffer) throw err;
      }
    };
  }

  // PUBLIC API of PeerConnection ##################################
  //
  // { startNegotiation, close } = PeerConnection(...);

  return {
    // Start the negotiation process.
    startNegotiation: startNegotiation,
    // Close the connection with the peer.
    close: () => {
      pc.close();
      pc = null;
      signalingChannel = null; // is it needed?
    },
  };
}

// The four features enabling perfect negotiation are
// detailed in this discussions
// https://groups.google.com/a/chromium.org/forum/#!topic/blink-dev/OqPfCpC5RYU
// They are:
//   1. The restartIce() function
//   2. The ability to call setLocalDescription() with no argument
//   3. The ability to implicit rollback in setRemoteDescription(offer)
//   4. Stopping and stopped transceiviers
//
// As of now (23 may of 2020), the compatibility table for those three features is:
//
// restartIce():
//   Chrome 77, Edge 79, FF 70, Safari NO, Android Chrome 77, Android FF NO
// setLocalDescription() with no argument:
//   Chrome 80, Edge 80, FF 75, Safari NO, Android Chrome 80, Android FF NO
// setRemoteDescription() with implicit rollback:
//   Chrome NO, Edge NO, FF 75, Safari NO, Android Chrome NO, Android FF NO
//
// Only Desktop FF >= 75 is compatible with perfect negotiation.
// We can detect this with:
async function compatiblePerfectNegotiation() {
  try {
    // Check that setLocalDescription() with no argument is supported.
    // This will rule out the Android version of Firefox.
    let pc = new RTCPeerConnection();
    await pc.setLocalDescription();

    // Now rule out browsers that are not Firefox.
    // A better way would be to test for the implicit rollback
    // capability of setRemoteDescription() but I don't know how ...
    return window.mozInnerScreenX != undefined;
  } catch (e) {
    return false;
  }
}
