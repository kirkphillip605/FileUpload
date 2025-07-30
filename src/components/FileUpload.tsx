import React, { useState, useRef } from 'react';
import { Upload, File, CheckCircle, X, LogOut } from 'lucide-react';

interface FileUploadProps {
  onLogout: () => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'success' | 'error';
  progress: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLogout }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const simulateUpload = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const newFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0
      };

      setUploadedFiles(prev => [...prev, newFile]);

      // Simulate upload progress
      const interval = setInterval(() => {
        setUploadedFiles(prev => 
          prev.map(f => {
            if (f.id === fileId && f.progress < 100) {
              const newProgress = Math.min(f.progress + Math.random() * 30, 100);
              if (newProgress === 100) {
                clearInterval(interval);
                setTimeout(() => {
                  setUploadedFiles(prev => 
                    prev.map(file => 
                      file.id === fileId ? { ...file, status: 'success' } : file
                    )
                  );
                  resolve();
                }, 300);
                return { ...f, progress: newProgress };
              }
              return { ...f, progress: newProgress };
            }
            return f;
          })
        );
      }, 100);
    });
  };

  const handleFiles = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      await simulateUpload(files[i]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleLogout = () => {
    localStorage.removeItem('fileUploadAuth');
    onLogout();
  };

  const successCount = uploadedFiles.filter(f => f.status === 'success').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">File Upload</h1>
              <p className="text-gray-600 mt-1">Upload your files securely</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
              title="Logout"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }
            `}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isDragOver ? 'Drop files here' : 'Upload Files'}
            </h3>
            <p className="text-gray-600 mb-4">
              Drag and drop files here, or click to select files
            </p>
            <p className="text-sm text-gray-500">
              No size limit • All file types supported
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Success Summary */}
        {successCount > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6">
            <div className="flex items-center">
              <CheckCircle className="w-6 h-6 text-green-600 mr-3" />
              <div>
                <h3 className="text-lg font-semibold text-green-900">
                  {successCount} file{successCount !== 1 ? 's' : ''} uploaded successfully!
                </h3>
                <p className="text-green-700">
                  Your files have been received and are being processed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Uploads</h3>
            <div className="space-y-4">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center p-4 bg-gray-50 rounded-xl">
                  <File className="w-8 h-8 text-blue-500 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                    {file.status === 'uploading' && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Uploading...</span>
                          <span>{Math.round(file.progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    {file.status === 'success' && (
                      <div className="flex items-center mt-1">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                        <span className="text-sm text-green-600">Upload complete</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-all flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};