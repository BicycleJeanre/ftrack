// Firebase web-app configuration for FTrack.
//
// Firebase web identifiers are public application configuration, not
// administrative credentials. Keep service-account and Admin SDK credentials
// out of this file and out of the client application.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyCjtzS023AGDWwSxOUIA6wWqztioOAh3V4',
  authDomain: 'ftrack-f7c0b.firebaseapp.com',
  projectId: 'ftrack-f7c0b',
  storageBucket: 'ftrack-f7c0b.firebasestorage.app',
  messagingSenderId: '1015813548249',
  appId: '1:1015813548249:web:7c4da7395ad8c0db52b6c8'
});

export const firebaseEmulators = Object.freeze({
  enabled: false,
  authHost: '127.0.0.1',
  authPort: 9099,
  firestoreHost: '127.0.0.1',
  firestorePort: 8080
});
