# Peer Chat

Peer Chat is a real-time video chat application built with React and WebRTC, allowing users to engage in peer-to-peer video conversations directly in their web browsers.

## Demo

You can try out the live demo of Peer Chat here: [https://peer-chat.web.app/](https://peer-chat.web.app/)

## Features

- Real-time video and audio communication
- Peer-to-peer connection using WebRTC
- Screen sharing capability
- Toggle camera and microphone on/off
- Copy invite link functionality
- Responsive design for desktop and mobile devices

## Technologies Used

- React.js
- WebRTC
- Firebase (Firestore for signaling)
- Tailwind CSS for styling

## How It Works

1. When a user starts a call, the application creates a new document in Firebase Firestore to store call details.
2. The caller's WebRTC peer connection creates an offer, which is stored in the Firestore document.
3. When another user joins the call, their peer connection creates an answer, also stored in Firestore.
4. Both peers exchange ICE candidates through Firestore to establish a direct peer-to-peer connection.
5. Once connected, video and audio streams are exchanged directly between the peers without going through a server.

## Local Development

To run this project locally:

1. Clone the repository
2. Install dependencies with `npm install`
3. Set up a Firebase project and add your configuration to the project
4. Create a `config.js` file in the `src` folder with the following content:

```javascript
export const firebaseConfig = {
  // Your Firebase configuration object
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export const iceServers = [
  {
    urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
  },
  // Add your TURN servers here if you have any
];
```

5. Run the development server with `npm start`

Make sure to replace the placeholder values in the `firebaseConfig` object with your actual Firebase project configuration. You can find these values in your Firebase project settings.

The `iceServers` array should include STUN servers and any TURN servers you want to use. The example includes Google's public STUN servers, which are sufficient for most use cases. However, for more reliable connections, especially in restrictive network environments, you may want to add TURN servers.
