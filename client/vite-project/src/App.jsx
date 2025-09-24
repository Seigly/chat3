import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { createPeerConnection } from './webrtc';

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3000';

export default function App() {
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [peerId, setPeerId] = useState(null);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const peerIdRef = useRef(null);

  useEffect(() => {
    const socket = io(SIGNALING_SERVER, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => addLog('connected to signaling: ' + socket.id));
    socket.on('queued', () => { addLog('queued, waiting...'); setStatus('queued'); });
    socket.on('matched', ({ sessionId, peerSocketId }) => {
      addLog('matched with ' + peerSocketId);
      setStatus('matched');
      setPeerId(peerSocketId);
      peerIdRef.current = peerSocketId;

      const isInitiator = socket.id < peerSocketId;
      pcRef.current = createPeerConnection({
        isInitiator,
        onData: (msg) => addLog('peer: ' + msg),
        onStateChange: (s) => addLog('datachannel: ' + s),
        sendSignal: (data) => socket.emit('signal', { to: peerSocketId, data }),
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      if (isInitiator) pcRef.current.createOffer().catch(e => addLog('offer error: ' + e.message));
    });

    socket.on('signal', async ({ from, data }) => {
      if (!pcRef.current) return;
      if (from !== peerIdRef.current) return;
      await pcRef.current.handleSignal(data);
    });

    socket.on('relay_msg', ({ from, text }) => addLog('relay from ' + from + ': ' + text));
    socket.on('peer_left', () => { addLog('peer left'); cleanupSession(); });
    socket.on('kicked', ({ reason }) => { addLog('you were kicked: ' + reason); cleanupSession(); });
    socket.on('left_queue', () => { addLog('Successfully left queue'); cleanupSession(); setStatus('idle'); });

    return () => { socket.disconnect(); cleanupSession(); };
  }, []);

  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);

  function addLog(t) {
    setLogs(l => [...l, `${new Date().toLocaleTimeString()} - ${t}`].slice(-200));
  }

  function start() {
    socketRef.current.emit('join_queue', { filters: {} });
    addLog('join_queue sent');
  }

  function leave() {
    socketRef.current.emit('leave_queue');
    addLog('leave_queue sent');
  }

  function sendTextPrompt() {
    const text = prompt('Message to send');
    if (!text) return;
    try {
      if (pcRef.current) {
        pcRef.current.sendText(text);
        addLog('me: ' + text);
      } else if (peerId) {
        socketRef.current.emit('relay_msg', { to: peerId, text });
        addLog('relay me: ' + text);
      } else addLog('not connected to peer');
    } catch (e) {
      addLog('send failed: ' + e.message);
    }
  }

  function next() {
    addLog('Next pressed - requeueing');
    cleanupSession();
    socketRef.current.emit('join_queue', { filters: {} });
  }

  function report() {
    const sessionId = null;
    socketRef.current.emit('report', { sessionId, reason: 'user_report' });
    addLog('reported');
  }

  function cleanupSession() {
    try { pcRef.current?.pc.close(); } catch (e) {}
    pcRef.current = null;
    setPeerId(null);
    setStatus('idle');
  }

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h2>Chitchat — MVP</h2>
      <div>Status: {status}</div>
      <div style={{ marginTop: 10 }}>
        <button onClick={start}>Start</button>
        <button onClick={leave} style={{ marginLeft: 8 }}>Leave Queue</button>
        <button onClick={sendTextPrompt} style={{ marginLeft: 8 }}>Send Message</button>
        <button onClick={next} style={{ marginLeft: 8 }}>Next</button>
        <button onClick={report} style={{ marginLeft: 8 }}>Report</button>
      </div>
      <div style={{ marginTop: 20 }}>
        <h4>Logs</h4>
        <div style={{ maxHeight: 400, overflow: 'auto', background: '#f1f1f1', padding: 10 }}>
          {logs.map((l, i) => <div key={i} style={{ fontSize: 13 }}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
