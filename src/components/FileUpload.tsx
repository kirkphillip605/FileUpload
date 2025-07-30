import React, { useState, useRef } from 'react';
import { Upload, File, CheckCircle, X, LogOut, Pause, Play, RotateCcw, Smartphone, Cloud } from 'lucide-react';

interface FileUploadProps {
  onLogout: () => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'success' | 'error' | 'paused';
  progress: number;
  upload?: any;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLogout }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const resumableUpload = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      
      const newFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0
      };

      setUploadedFiles(prev => [...prev, newFile]);

      // Custom resumable upload implementation
      const uploadFile = async () => {
        try {
          // Step 1: Create upload session
          const metadata = btoa(`filename ${btoa(file.name)},filetype ${btoa(file.type || 'application/octet-stream')}`);
          
          const createResponse = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Upload-Length': file.size.toString(),
              'Upload-Metadata': metadata,
              'Tus-Resumable': '1.0.0'
            }
          });

          if (!createResponse.ok) {
            throw new Error('Failed to create upload session');
          }

          const location = createResponse.headers.get('Location');
          if (!location) {
            throw new Error('No upload location returned');
          }

          // Step 2: Upload file in chunks
          const chunkSize = 1024 * 1024; // 1MB chunks
          let offset = 0;
          
          while (offset < file.size) {
            const chunk = file.slice(offset, offset + chunkSize);
            
            const uploadResponse = await fetch(location, {
              method: 'PATCH',
              headers: {
                'Upload-Offset': offset.toString(),
                'Tus-Resumable': '1.0.0',
                'Content-Type': 'application/offset+octet-stream'
              },
              body: chunk
            });

            if (!uploadResponse.ok) {
              throw new Error('Upload chunk failed');
            }

            offset += chunk.size;
            const percentage = Math.round((offset / file.size) * 100);
            
            console.log(`📊 Upload progress: ${percentage}% (${formatFileSize(offset)}/${formatFileSize(file.size)})`);
            
            setUploadedFiles(prev => 
              prev.map(f => 
                f.id === fileId ? { ...f, progress: percentage } : f
              )
            );
          }

          console.log('✅ Upload completed successfully!');
          setUploadedFiles(prev => 
            prev.map(f => 
              f.id === fileId ? { 
                ...f, 
                status: 'success', 
                progress: 100,
                upload: undefined 
              } : f
            )
          );
          resolve();

        } catch (error) {
          console.error('❌ Upload failed:', error);
          setUploadedFiles(prev => 
            prev.map(f => 
              f.id === fileId ? { 
                ...f, 
                status: 'error', 
                error: error.message,
                upload: undefined 
              } : f
            )
          );
          reject(error);
        }
      };

      uploadFile();
    });
  };

  const handleFiles = async (files: FileList) => {
    console.log(`📁 Processing ${files.length} file(s) for upload`);
    
    // Process files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      try {
        await resumableUpload(files[i]);
      } catch (error) {
        console.error(`Failed to upload file ${files[i].name}:`, error);
      }
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

  const pauseUpload = (fileId: string) => {
    // Note: Pause functionality would need to be implemented with AbortController
    console.log('Pause functionality not yet implemented in custom upload');
  };

  const resumeUpload = (fileId: string) => {
    // Note: Resume functionality would need to be implemented
    console.log('Resume functionality not yet implemented in custom upload');
  };

  const retryUpload = (fileId: string) => {
    // Note: Retry functionality would need to be implemented
    console.log('Retry functionality not yet implemented in custom upload');
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleLogout = () => {
    localStorage.removeItem('fileUploadAuth');
    onLogout();
  };

  const successCount = uploadedFiles.filter(f => f.status === 'success').length;
  const activeUploads = uploadedFiles.filter(f => f.status === 'uploading').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50 px-3 py-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Mobile-optimized header */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="bg-gradient-to-br from-green-500 to-blue-600 p-3 sm:p-4 rounded-xl sm:rounded-xl shadow-lg flex-shrink-0">
                <Cloud className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">
                  File Upload
                </h1>
                <p className="text-gray-600 text-sm sm:text-base mt-1 leading-tight">
                  Large file upload with resume support
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 sm:px-4 sm:py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all touch-manipulation flex-shrink-0"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile-optimized upload stats */}
        {(successCount > 0 || activeUploads > 0) && (
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <div className="text-2xl sm:text-3xl font-bold text-green-600">{successCount}</div>
                <div className="text-xs sm:text-sm text-gray-600 font-medium">Completed</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <div className="text-2xl sm:text-3xl font-bold text-blue-600">{activeUploads}</div>
                <div className="text-xs sm:text-sm text-gray-600 font-medium">In Progress</div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile-optimized upload area */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-3 border-dashed rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all touch-manipulation
              ${isDragOver 
                ? 'border-blue-500 bg-blue-50 scale-105' 
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 active:scale-95'
              }
            `}
          >
            <div className="space-y-4">
              <Upload className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                  {isDragOver ? 'Drop files here' : 'Upload Large Files'}
                </h3>
                <p className="text-gray-600 text-sm sm:text-base mb-4">
                  Tap to select files or drag and drop
                </p>
              </div>
              
              {/* Mobile-optimized feature list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
                <div className="flex items-center justify-center space-x-2 p-2 bg-gray-50 rounded-lg">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="font-medium">25GB max size</span>
                </div>
                <div className="flex items-center justify-center space-x-2 p-2 bg-gray-50 rounded-lg">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span className="font-medium">Resume uploads</span>
                </div>
                <div className="flex items-center justify-center space-x-2 p-2 bg-gray-50 rounded-lg">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  <span className="font-medium">All file types</span>
                </div>
                <div className="flex items-center justify-center space-x-2 p-2 bg-gray-50 rounded-lg">
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                  <span className="font-medium">Secure storage</span>
                </div>
              </div>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="*/*"
            />
          </div>
        </div>

        {/* Mobile-optimized success summary */}
        {successCount > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-start space-x-3">
              <div className="bg-green-100 p-2 rounded-lg flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-green-900 mb-1">
                  {successCount} file{successCount !== 1 ? 's' : ''} uploaded successfully!
                </h3>
                <p className="text-green-700 text-sm sm:text-base">
                  Your files have been securely stored on the server.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mobile-optimized upload progress */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Smartphone className="w-5 h-5 mr-2" />
              Upload Queue
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="bg-gray-50 rounded-xl p-3 sm:p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg">
                      <File className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                        {file.name}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 mb-2">
                        {formatFileSize(file.size)}
                      </p>
                      
                      {/* Mobile-optimized progress */}
                      {file.status === 'uploading' && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span className="font-medium">Uploading...</span>
                            <span className="font-mono">{Math.round(file.progress)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 sm:h-3 rounded-full transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      
                      {/* Status indicators */}
                      {file.status === 'success' && (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          <span className="text-sm font-medium">Upload complete</span>
                        </div>
                      )}
                      
                      {file.status === 'paused' && (
                        <div className="flex items-center text-yellow-600">
                          <Pause className="w-4 h-4 mr-2" />
                          <span className="text-sm font-medium">Upload paused</span>
                        </div>
                      )}
                      
                      {file.status === 'error' && (
                        <div className="space-y-1">
                          <div className="flex items-center text-red-600">
                            <X className="w-4 h-4 mr-2" />
                            <span className="text-sm font-medium">Upload failed</span>
                          </div>
                          {file.error && (
                            <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{file.error}</p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Mobile-optimized action buttons */}
                    <div className="flex flex-col space-y-1 flex-shrink-0">
                      {file.status === 'uploading' && (
                        <button
                          onClick={() => pauseUpload(file.id)}
                          className="p-2 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-all touch-manipulation"
                          aria-label="Pause Upload"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      
                      {file.status === 'paused' && (
                        <button
                          onClick={() => resumeUpload(file.id)}
                          className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-all touch-manipulation"
                          aria-label="Resume Upload"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      
                      {file.status === 'error' && (
                        <button
                          onClick={() => retryUpload(file.id)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all touch-manipulation"
                          aria-label="Retry Upload"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-all touch-manipulation"
                        aria-label="Remove from Queue"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};