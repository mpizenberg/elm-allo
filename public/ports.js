// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

activatePorts = (app, containerSize) => {
  // Inform the Elm app when its container div gets resized.
  window.addEventListener("resize", () =>
    app.ports.resize.send(containerSize())
  );

  // Hide / Show video
  app.ports.hideShow.subscribe((camOn) => {
    const localVideo = document.getElementById("localVideo");
    camOn ? localVideo.play() : localVideo.pause();
  });

  // Fullscreen
  app.ports.requestFullscreen.subscribe(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    }
  });
  app.ports.exitFullscreen.subscribe(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });
};
