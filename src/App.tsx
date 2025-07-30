import React, { useState, useEffect } from 'react';
import { LoginForm } from './components/LoginForm';
import { FileUpload } from './components/FileUpload';
import { FileManager } from './components/FileManager';

type UserRole = 'uploader' | 'admin' | null;

function App() {
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const authStatus = localStorage.getItem('fileUploadAuth');
    if (authStatus === 'uploader' || authStatus === 'admin') {
      setUserRole(authStatus as UserRole);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (role: UserRole) => {
    setUserRole(role);
  };

  const handleLogout = () => {
    setUserRole(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      {userRole === 'uploader' ? (
        <FileUpload onLogout={handleLogout} />
      ) : userRole === 'admin' ? (
        <FileManager onLogout={handleLogout} />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;