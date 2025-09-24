// client/src/webrtc.js
export function createPeerConnection({ isInitiator, onData, onStateChange, sendSignal, iceServers }) {
  const pc = new RTCPeerConnection({ iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
  let dc = null;

  function setupDC(channel) {
    dc = channel;
    dc.onopen = () => onStateChange?.('open');
    dc.onclose = () => onStateChange?.('closed');
    dc.onmessage = (e) => onData?.(e.data);
  }

  if (isInitiator) {
    const channel = pc.createDataChannel('chat');
    setupDC(channel);
  } else {
    pc.ondatachannel = (ev) => setupDC(ev.channel);
  }

  pc.onicecandidate = (ev) => {
    if (ev.candidate) sendSignal({ type: 'ice', candidate: ev.candidate });
  };

  async function createOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'sdp', sdp: offer });
  }

  async function handleSignal(data) {
    if (!data) return;
    if (data.type === 'sdp') {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'sdp', sdp: answer });
      }
    } else if (data.type === 'ice') {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (e) {
        console.warn('Failed to add ICE candidate', e);
      }
    }
  }

  function sendText(text) {
    if (dc && dc.readyState === 'open') {
      dc.send(text);
    } else {
      throw new Error('DataChannel not open');
    }
  }

  return { pc, createOffer, handleSignal, sendText };
}
