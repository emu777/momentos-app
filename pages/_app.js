import '../styles/globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../contexts/AuthContext';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider initialSession={pageProps.initialSession}>
      <Toaster position="top-center" />
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;