import React from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { FaVideo } from "react-icons/fa";

function Home() {
  const navigate = useNavigate();

  const startNewCall = async () => {
    const callDoc = await addDoc(collection(db, "calls"), {
      status: "active",
      activeParticipants: 0,
    });
    const id = callDoc.id;
    navigate(`/chat?id=${id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex flex-col items-center justify-center text-white p-4">
      <div className="max-w-2xl w-full text-center">
        <p className="text-xl mb-12">
          Start a secure video call with just one click. Connect with friends,
          family, or colleagues instantly.
        </p>
        <button
          onClick={startNewCall}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-full text-xl transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center mx-auto"
        >
          <FaVideo className="mr-2" />
          Start New Call
        </button>
      </div>
    </div>
  );
}

export default Home;
