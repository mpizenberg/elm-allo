// Global variables
let local_stream;
let signalingSocket;
let pcs = new Map();
let localVideo;

// Configuration
const stream_config = {
  audio: true,
  video: { facingMode: "user", frameRate: 15, width: 320, height: 240 },
};
const socket_address = "wss://" + window.location.host;
const ice_config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// INIT ##############################################################

// Activate local camera stream
async function initWebRTC(localVideoId, newStreamPort, remoteDisconnectedPort) {
  try {
    local_stream = await navigator.mediaDevices.getUserMedia(stream_config);
    localVideo = document.getElementById(localVideoId);
    localVideo.srcObject = local_stream;
    initSignalingAndPC(newStreamPort, remoteDisconnectedPort);
  } catch (error) {
    console.log(error);
  }
}

function initSignalingAndPC(newStreamPort, remoteDisconnectedPort) {
  // Setup signaling and peer connection.
  signalingSocket = new SignalingSocket(socket_address);
  signalingSocket.onRemotePeerConnected = (chan, polite) => {
    console.log("Peer connected", chan.remotePeerId);
    const pc = new PeerConnection(ice_config, chan, polite);
    pcs.set(chan.remotePeerId, pc);
    // const remote_video = document.createElement("video");
    // remote_video.id = chan.remotePeerId.toString();
    // remote_video.setAttribute("autoplay", "autoplay");
    // remote_video.setAttribute("playsinline", "playsinline");
    // remote_videos.appendChild(remote_video);
    pc.onRemoteTrack = (streams) => {
      // TODO: call elm port
      newStreamPort({ id: chan.remotePeerId, stream: streams[0] });
      // remote_video.srcObject = streams[0];
    };
    pc.setLocalStream(local_stream);
  };
  signalingSocket.onRemotePeerDisconnected = (remotePeerId) => {
    const pc = pcs.get(remotePeerId);
    if (pc == undefined) return;
    pc.close();
    pcs.delete(remotePeerId);
    // TODO: call elm port
    remoteDisconnectedPort(remotePeerId);
    // const remote_video = document.getElementById(remotePeerId);
    // remote_videos.removeChild(remote_video);
  };
}

// JOIN ##############################################################

// TODO: connect to elm port
function joinCall() {
  // join_button.disabled = true;
  // leave_button.disabled = false;
  signalingSocket.join();
}

// LEAVE #############################################################

// TODO: connect to elm port
function leaveCall() {
  // join_button.disabled = false;
  // leave_button.disabled = true;
  signalingSocket.leave();
  for (let pc of pcs.values()) {
    pc.close();
  }
  pcs.clear();
  // remote_videos.textContent = "";
}

// MUTE/UNMUTE #######################################################

// TODO: connect to elm port
function mute(micOn) {
  let audio_track = local_stream.getAudioTracks()[0];
  audio_track.enabled = micOn;
  // mute_button.textContent = audio_track.enabled ? "Mute" : "Unmute";
}

// VIDEO HIDE/SHOW ###################################################

// TODO: connect to elm port
function hide(camOn) {
  let video_track = local_stream.getVideoTracks()[0];
  video_track.enabled = camOn;
  // hide_button.textContent = video_track.enabled ? "Hide" : "Show";
}
