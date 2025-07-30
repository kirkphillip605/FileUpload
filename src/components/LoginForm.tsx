import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Smartphone } from 'lucide-react';

interface LoginFormProps {
  onLogin: (role: 'uploader' | 'admin') => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate a brief loading state for better UX
    await new Promise(resolve => setTimeout(resolve, 500));

    if (password === 'fireworks') {
      localStorage.setItem('fileUploadAuth', 'uploader');
      onLogin('uploader');
    } else if (password === '!Jameson5475!') {
      localStorage.setItem('fileUploadAuth', 'admin');
      onLogin('admin');
    } else {
      setError('Invalid password. Please try again.');
      setPassword('');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-gray-100">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 leading-tight">
              Secure Upload
            </h1>
            <p className="text-gray-600 text-sm sm:text-base px-2">
              Enter password to access the file system
            </p>
          </div>

          {/* Mobile-optimized form */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-3">
                Access Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-4 sm:py-3 text-base sm:text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 touch-manipulation"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 font-medium flex items-center">
                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                    {error}
                  </p>
                </div>
              )}
            </div>

            {/* Mobile-optimized submit button */}
            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold text-base hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95 touch-manipulation shadow-lg"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Verifying Access...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <Smartphone className="w-5 h-5 mr-2" />
                  Access Upload System
                </div>
              )}
            </button>
            
            {/* Mobile-friendly help text */}
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="text-center">
                <div className="text-xs text-blue-700 space-y-1">
                  <p className="font-medium">Access Levels:</p>
                  <p>📤 <span className="font-mono bg-blue-100 px-1 rounded">fireworks</span> - File uploads</p>
                  <p>⚙️ Admin password - Full file management</p>
                </div>
              </div>
            </div>
          </form>
        </div>
        
        {/* Mobile footer */}
        <div className="text-center mt-4 px-4">
          <p className="text-xs text-gray-500">
            Optimized for mobile devices • Secure file transfer
          </p>
        </div>
      </div>
    </div>
  );
};