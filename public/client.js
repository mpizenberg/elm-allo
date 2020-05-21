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
    pc.onRemoteTrack = (streams) => {
      newStreamPort({ id: chan.remotePeerId, stream: streams[0] });
    };
    pc.setLocalStream(local_stream);
  };
  signalingSocket.onRemotePeerDisconnected = (remotePeerId) => {
    const pc = pcs.get(remotePeerId);
    if (pc == undefined) return;
    pc.close();
    pcs.delete(remotePeerId);
    remoteDisconnectedPort(remotePeerId);
  };
}

// JOIN ##############################################################

function joinCall() {
  signalingSocket.join();
}

// LEAVE #############################################################

function leaveCall() {
  signalingSocket.leave();
  for (let pc of pcs.values()) {
    pc.close();
  }
  pcs.clear();
}

// MUTE/UNMUTE #######################################################

function mute(micOn) {
  let audio_track = local_stream.getAudioTracks()[0];
  audio_track.enabled = micOn;
}

// VIDEO HIDE/SHOW ###################################################

function hide(camOn) {
  let video_track = local_stream.getVideoTracks()[0];
  video_track.enabled = camOn;
}
