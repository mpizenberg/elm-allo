// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// activatePorts = (app, containerSize, WebRTCClient) => {
activatePorts = (app, containerSize, SignalingSocket, Peer) => {
  // Inform the Elm app when its container div gets resized.
  window.addEventListener("resize", () =>
    app.ports.resize.send(containerSize())
  );

  // Fullscreen
  fscreen = Fscreen();
  app.ports.requestFullscreen.subscribe(() => {
    if (fscreen.fullscreenElement != null) return;
    fscreen.requestFullscreen(document.documentElement);
  });
  app.ports.exitFullscreen.subscribe(() => {
    if (fscreen.fullscreenElement == null) return;
    fscreen.exitFullscreen();
  });

  // WebRTC
  app.ports.readyForLocalStream.subscribe(async (localVideoId) => {
    try {
      // Access mic and webcam.
      let localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: "user",
          width: 320,
          height: 240,
        },
      });

      let peers = new Map();

      // Setup the "greeting" socket.
      let { join, leave } = await SignalingSocket({
        socketAddress: "wss://" + window.location.host,
        onRemotePeerConnected: (me, channel, polite) => {
          const id = me.toString();
          let peer = new Peer(id, {
            host: "/",
            path: "/peerjs/allo",
            secure: true,
            debug: 2,
          });

          peers.set(remotePeerId, peer);

          peer.on("close", () => {
            app.ports.remoteDisconnected.send(channel.remotePeerId);
            peers.delete(remotePeerId);
          });

          function updatedStream(remoteStream) {
            app.ports.updatedStream.send({
              id: channel.remotePeerId,
              stream: remoteStream,
            });
          }

          if (!polite) {
            // The impolite peer is the caller.
            let mediaConnection = peer.call(channel.remotePeerId, localStream);
            mediaConnection.on("stream", updatedStream);
          } else {
            // The polite peer is the callee.
            peer.on("call", (mediaConnection) => {
              mediaConnection.answer(localStream);
              mediaConnection.on("stream", updatedStream);
            });
          }
        },
        // Unused because we switched to PeerJS.
        onRemotePeerDisconnected: (remotePeerId) => {},
      });
      // let { localStream, join, leave, setMic, setCam } = await WebRTCClient({
      //   onRemoteDisconnected: app.ports.remoteDisconnected.send,
      //   onUpdatedStream: app.ports.updatedStream.send,
      // });

      // Set the local stream to the associated video.
      let localVideo = document.getElementById(localVideoId);
      localVideo.srcObject = localStream;

      // Join / leave a call
      app.ports.joinCall.subscribe(join);
      app.ports.leaveCall.subscribe(() => {
        leave();
        for (let peer of peers.values()) peer.destroy();
        peers.clear();
      });

      // On / Off microphone and video
      app.ports.mute.subscribe((micOn) => {
        localStream.getAudioTracks()[0].enabled = micOn;
      });
      app.ports.hide.subscribe((camOn) => {
        localStream.getVideoTracks()[0].enabled = camOn;
      });
    } catch (error) {
      console.error(error);
    }
  });

  // Update the srcObject of a video with a stream.
  // Wait one frame to give time to the VDOM to create the video object.
  app.ports.videoReadyForStream.subscribe(({ id, stream }) => {
    requestAnimationFrame(() => {
      const video = document.getElementById(id);
      if (video.srcObject) return;
      video.srcObject = stream;
    });
  });
};
