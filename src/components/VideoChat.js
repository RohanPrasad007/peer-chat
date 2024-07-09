import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FaVideo,
  FaVideoSlash,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaLink,
  FaDesktop,
} from "react-icons/fa";
import { iceServers } from "../config";

const servers = {
  iceServers,
  iceCandidatePoolSize: 10,
};

const VideoChat = () => {
  const [callId, setCallId] = useState("");
  const [listeners, setListeners] = useState([]);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localStream = useRef();
  const remoteStream = useRef();
  const peerConnection = useRef();
  const initialized = useRef(false);
  const hasCreatedOffer = useRef(false);
  const screenStream = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const joinCall = async () => {
        const searchParams = new URLSearchParams(location.search);
        const id = searchParams.get("id");
        if (id && !callId) {
          setCallId(id);
          const callDoc = doc(db, "calls", id);
          const callData = await getDoc(callDoc);
          console.log(callData.data());
          if (callData.exists()) {
            if (callData.data().activeParticipants === 1) {
              await createAnswer(id);
            } else if (callData.data().activeParticipants === 0) {
              await createOffer(id);
            } else if (callData.data().activeParticipants === 2) {
              alert("Call is full");
            }
          }
          listenForParticipants(id);
        }
      };

      window.addEventListener("beforeunload", handleUserLeave);

      joinCall();
      return () => {
        window.removeEventListener("beforeunload", handleUserLeave);
        cleanup();
      };
    }
    // eslint-disable-next-line
  }, []);

  const listenForParticipants = async (id) => {
    const callDoc = doc(db, "calls", id);
    const callData = await getDoc(callDoc);
    let prevActiveParticipants = callData.data().activeParticipants;

    const unsubscribe = onSnapshot(callDoc, (docSnapshot) => {
      console.log("Listening for participants", prevActiveParticipants);
      const callData = docSnapshot.data();
      if (callData) {
        const activeParticipants = callData.activeParticipants;
        if (activeParticipants !== prevActiveParticipants) {
          console.log("Active participants: ", activeParticipants);
          console.log("Has created offer", hasCreatedOffer.current);

          if (callData.status === "cancelled") {
            if (
              callData.cancelledBy !==
              peerConnection.current?.localDescription?.type
            ) {
              resetCallAndCreateNewOffer(id);
            }
          } else if (activeParticipants === 1) {
            if (prevActiveParticipants === 2) {
              // A user just left, reset and create new offer
              resetCallAndCreateNewOffer(id);
            } else if (!hasCreatedOffer.current) {
              // New user joining, create answer
              console.log("creating answer from here");
              createAnswer(id);
            }
          } else if (activeParticipants === 0) {
            createOffer(id);
          }

          prevActiveParticipants = activeParticipants;
        }
      }
      console.log("Listening for participants 2", prevActiveParticipants);
    });
    setListeners((prev) => [...prev, unsubscribe]);
    return unsubscribe;
  };

  const init = async () => {
    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("user-1").srcObject = localStream.current;
  };

  const createPeerConnection = () => {
    peerConnection.current = new RTCPeerConnection(servers);
    remoteStream.current = new MediaStream();
    document.getElementById("user-2").srcObject = remoteStream.current;

    localStream.current.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, localStream.current);
    });

    peerConnection.current.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.current.addTrack(track);
      });
    };

    // Handle peer disconnection
    peerConnection.current.oniceconnectionstatechange = () => {
      if (peerConnection.current.iceConnectionState === "disconnected") {
        handlePeerDisconnection();
      }
    };
  };

  const handlePeerDisconnection = () => {
    // Clear remote video stream
    remoteStream.current.getTracks().forEach((track) => track.stop());
    document.getElementById("user-2").srcObject = null;
  };

  const createOffer = async (id) => {
    await init();
    await createPeerConnection();

    const callDoc = doc(db, "calls", id);
    const callData = (await getDoc(callDoc)).data();
    const offerCandidates = collection(callDoc, "offerCandidates");
    const answerCandidates = collection(callDoc, "answerCandidates");
    console.log("callDoc", callData);
    peerConnection.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(offerCandidates, event.candidate.toJSON());
      }
    };

    const offerDescription = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };
    await updateDoc(callDoc, {
      offer,
      status: "active",
      activeParticipants: 1,
    });
    console.log("Offer created");
    hasCreatedOffer.current = true;

    const unsubscribeCallDoc = onSnapshot(callDoc, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && peerConnection.current) {
        const answerDescription = new RTCSessionDescription(data.answer);
        console.log(
          "Answer description received, current state:",
          peerConnection.current.signalingState
        );

        try {
          if (peerConnection.current.signalingState === "have-local-offer") {
            console.log("Setting remote description");
            await peerConnection.current.setRemoteDescription(
              answerDescription
            );
          } else if (peerConnection.current.signalingState === "stable") {
            console.log("Peer connection is stable, resetting the connection");
            await peerConnection.current.setLocalDescription({
              type: "offer",
              sdp: peerConnection.current.localDescription.sdp,
            });
            await peerConnection.current.setRemoteDescription(
              answerDescription
            );
          } else {
            console.log(
              "Unexpected signaling state:",
              peerConnection.current.signalingState
            );
          }
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

    const unsubscribeAnswerCandidates = onSnapshot(
      answerCandidates,
      (snapshot) => {
        if (peerConnection.current) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const candidate = new RTCIceCandidate(change.doc.data());
              if (
                peerConnection.current &&
                peerConnection.current.remoteDescription
              ) {
                peerConnection.current.addIceCandidate(candidate);
              }
            }
          });
        }
      }
    );

    setListeners((prev) => [
      ...prev,
      unsubscribeCallDoc,
      unsubscribeAnswerCandidates,
    ]);
  };

  const createAnswer = async (id) => {
    if (hasCreatedOffer.current) {
      return;
    }
    await init();
    await createPeerConnection();

    console.log("Creating answer");

    const callDoc = doc(db, "calls", id);
    const answerCandidates = collection(callDoc, "answerCandidates");
    const offerCandidates = collection(callDoc, "offerCandidates");

    peerConnection.current.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(answerCandidates, event.candidate.toJSON());
      }
    };

    const callData = (await getDoc(callDoc)).data();
    if (!callData || !callData.offer) {
      console.error("Offer not found in the call document");
      return;
    }

    const offerDescription = new RTCSessionDescription(callData.offer);
    console.log("Offer description here the problem is");
    await peerConnection.current.setRemoteDescription(offerDescription);

    const answerDescription = await peerConnection.current.createAnswer();
    if (peerConnection.current.signalingState === "have-remote-offer") {
      await peerConnection.current.setLocalDescription(answerDescription);
    } else {
      console.error("Cannot set local description: Wrong signaling state");
      return;
    }

    const answer = {
      sdp: answerDescription.sdp,
      type: answerDescription.type,
    };
    await updateDoc(callDoc, {
      activeParticipants: 2,
      status: "active",
      answer,
    });

    const unsubscribeOfferCandidates = onSnapshot(
      offerCandidates,
      (snapshot) => {
        if (peerConnection.current) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const candidate = new RTCIceCandidate(change.doc.data());
              if (
                peerConnection.current &&
                peerConnection.current.remoteDescription
              ) {
                peerConnection.current.addIceCandidate(candidate);
              }
            }
          });
        }
      }
    );

    setListeners((prev) => [...prev, unsubscribeOfferCandidates]);
  };

  const handleUserLeave = (event) => {
    event.preventDefault();
    event.returnValue = "";
    cleanup();
  };

  const cleanup = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (remoteStream.current) {
      remoteStream.current.getTracks().forEach((track) => track.stop());
      remoteStream.current = null;
    }
    if (screenStream.current) {
      screenStream.current.getTracks().forEach((track) => track.stop());
      screenStream.current = null;
    }

    // Unsubscribe from all listeners
    listeners.forEach((unsubscribe) => unsubscribe());
    setListeners([]);
  };

  const cancelCall = async (callId) => {
    console.log("callId", callId);
    if (!callId) {
      console.error("callId is undefined");
      return;
    }
    const callDoc = doc(db, "calls", callId);
    const callData = await getDoc(callDoc);
    if (callData.exists()) {
      const activeParticipants = callData.data().activeParticipants;
      await updateDoc(callDoc, {
        status: "cancelled",
        activeParticipants: activeParticipants - 1,
        cancelledBy: peerConnection.current?.localDescription?.type, // 'offer' or 'answer'
      });
    }

    cleanup();
    navigate("/");
  };

  const resetCallAndCreateNewOffer = async (id) => {
    cleanup();
    hasCreatedOffer.current = false;

    // Reset the call document
    const callDoc = doc(db, "calls", id);
    await updateDoc(callDoc, {
      status: "active",
      activeParticipants: 1, // Set to 1 since this user is still in the call
      offer: null,
      answer: null,
    });

    // Delete existing candidates
    const offerCandidates = collection(callDoc, "offerCandidates");
    const answerCandidates = collection(callDoc, "answerCandidates");

    const deleteCollection = async (collectionRef) => {
      const snapshot = await getDocs(collectionRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    };

    await deleteCollection(offerCandidates);
    await deleteCollection(answerCandidates);

    // Create a new offer
    await createOffer(id);
  };

  const toggleCamera = () => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleMic = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMicOn(!isMicOn);
    }
  };

  const copyLinkToClipboard = () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl).then(() => {
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    });
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      console.log("this is working");
      try {
        screenStream.current = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        const videoTrack = screenStream.current.getVideoTracks()[0];

        if (peerConnection.current) {
          const senders = peerConnection.current.getSenders();
          const sender = senders.find((s) => s.track.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            peerConnection.current.addTrack(videoTrack, screenStream.current);
          }
        }

        videoTrack.onended = () => {
          stopScreenSharing();
        };

        document.getElementById("user-1").srcObject = screenStream.current;
        setIsScreenSharing(true);
      } catch (error) {
        console.error("Error starting screen share:", error);
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    if (screenStream.current) {
      screenStream.current.getTracks().forEach((track) => track.stop());

      if (peerConnection.current) {
        const senders = peerConnection.current.getSenders();
        const sender = senders.find((s) => s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(localStream.current.getVideoTracks()[0]);
        }
      }

      document.getElementById("user-1").srcObject = localStream.current;
      setIsScreenSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Video Call</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative w-full pt-[56.25%] bg-gray-800 rounded-lg overflow-hidden">
            <video
              id="user-1"
              className="absolute top-0 left-0 w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />
            <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-60 px-2 py-1 rounded">
              You {isScreenSharing ? "(Screen)" : ""}
            </div>
            {!isMicOn && (
              <div className="absolute top-2 right-2 bg-red-600 rounded-full p-2">
                <FaMicrophoneSlash size={16} />
              </div>
            )}
          </div>
          <div className="relative w-full pt-[56.25%] bg-gray-800 rounded-lg overflow-hidden">
            <video
              id="user-2"
              className="absolute top-0 left-0 w-full h-full object-cover"
              autoPlay
              playsInline
            />
            <div className="absolute bottom-2 left-2 bg-gray-900 bg-opacity-60 px-2 py-1 rounded">
              Remote User
            </div>
          </div>
        </div>
        <div className="flex justify-center space-x-6">
          <button
            onClick={toggleCamera}
            className={`p-4 rounded-full ${
              isCameraOn ? "bg-blue-600" : "bg-red-600"
            } hover:opacity-80 transition-opacity`}
          >
            {isCameraOn ? <FaVideo size={24} /> : <FaVideoSlash size={24} />}
          </button>
          <button
            onClick={toggleMic}
            className={`p-4 rounded-full ${
              isMicOn ? "bg-blue-600" : "bg-red-600"
            } hover:opacity-80 transition-opacity`}
          >
            {isMicOn ? (
              <FaMicrophone size={24} />
            ) : (
              <FaMicrophoneSlash size={24} />
            )}
          </button>
          <button
            onClick={toggleScreenShare}
            className={`p-4 rounded-full ${
              isScreenSharing ? "bg-blue-600" : "bg-green-600"
            } hover:opacity-80 transition-opacity`}
          >
            <FaDesktop size={24} />
          </button>
          <button
            onClick={copyLinkToClipboard}
            className="p-4 rounded-full bg-green-600 hover:opacity-80 transition-opacity relative"
          >
            <FaLink size={24} />
            {showCopiedMessage && (
              <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded">
                Copied!
              </span>
            )}
          </button>
          <button
            onClick={() => cancelCall(callId)}
            className="p-4 rounded-full bg-red-600 hover:opacity-80 transition-opacity"
          >
            <FaPhoneSlash size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
