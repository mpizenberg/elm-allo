// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

activatePorts = (app, containerSize, WebRTCClient) => {
  // Inform the Elm app when its container div gets resized.
  window.addEventListener("resize", () =>
    app.ports.resize.send(containerSize())
  );

  // Fullscreen
  fscreen = Fscreen();
  app.ports.requestFullscreen.subscribe(() =>
    fscreen.requestFullscreen(document.documentElement)
  );
  app.ports.exitFullscreen.subscribe(() => fscreen.exitFullscreen());

  // WebRTC
  app.ports.readyForLocalStream.subscribe(async (localVideoId) => {
    try {
      let { localStream, join, leave, setMic, setCam } = await WebRTCClient({
        audio: true,
        video: {
          facingMode: "user",
          width: 320,
          height: 240,
        },
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        // onRemoteConnected: (id) => { ... },
        onRemoteDisconnected: app.ports.remoteDisconnected.send,
        onUpdatedStream: app.ports.updatedStream.send,
      });

      // Set the local stream to the associated video.
      let localVideo = document.getElementById(localVideoId);
      localVideo.srcObject = localStream;

      // Join / leave a call
      app.ports.joinCall.subscribe(join);
      app.ports.leaveCall.subscribe(leave);

      // On / Off microphone and video
      app.ports.mute.subscribe(setMic);
      app.ports.hide.subscribe(setCam);
    } catch (error) {
      console.error(error);
    }
  });

  // Update the srcObject of a video with a stream.
  // Wait one frame to give time to the VDOM to create the video object.
  app.ports.videoReadyForStream.subscribe(({ id, stream }) => {
    requestAnimationFrame(() => {
      const video = document.getElementById(id);
      video.srcObject = stream;
    });
  });
};
